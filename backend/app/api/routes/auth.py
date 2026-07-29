# app/api/routes/auth.py
# Self-registration (gated by a license key — see /register below) is now
# the primary way accounts get created, for the multi-tenant/self-serve
# deployment. ALLOWED_USERS in .env (provision_allowed_users() below,
# called from app/main.py's lifespan) still works as an optional way to
# bootstrap a fixed account without going through registration — e.g. for
# your own admin/test account — but customers now sign themselves up.

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
from app.core.redis_client import redis_client
from app.core.security import (
    hash_password, verify_password, create_access_token, get_current_active_user,
)
from app.models.models import User, Company
from app.services import license_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


def _password_strength(v: str) -> str:
    """Shared validator — used by both /register and /change-password.
    Deliberately simple (length + one letter + one digit) rather than a
    long list of composition rules; those tend to push people toward
    predictable substitutions (Password1!) without much real security
    benefit. Length is what actually matters most."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isalpha() for c in v):
        raise ValueError("Password must contain at least one letter")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one number")
    return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    full_name: str
    email: str


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Rate limit BEFORE touching the DB — keyed on email+IP so one bad actor
    # can't lock out a real user by spamming their email from elsewhere,
    # while still capping brute-force attempts against any single account
    # from any single source.
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"login_attempts:{data.email.lower()}:{client_ip}"
    attempts = await redis_client.incr(rl_key, expire=settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS)
    if attempts > settings.LOGIN_RATE_LIMIT_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in a few minutes.",
        )

    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled — contact your admin")

    # Successful login — clear this window's counter so a legitimate user
    # who mistyped their password a couple of times isn't stuck waiting
    # out the rate-limit window once they get it right.
    await redis_client.delete(rl_key)

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user_id=user.id, full_name=user.full_name, email=user.email)


# Standard OAuth2 password-form endpoint at the path OAuth2PasswordBearer's
# tokenUrl points at (Swagger's "Authorize" button etc).
@router.post("/token", response_model=TokenResponse, include_in_schema=False)
async def token(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    return await login(LoginRequest(email=form.username, password=form.password), request, db)


@router.get("/me")
async def me(current_user: User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "created_at": current_user.created_at,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /register — self-serve signup, gated by a license key
# ─────────────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    license_key: str

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v):
        return _password_strength(v)

    @field_validator("full_name")
    @classmethod
    def _validate_full_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Please enter your full name")
        return v

    @field_validator("license_key")
    @classmethod
    def _validate_license_key(cls, v):
        v = v.strip().upper()
        if not v:
            raise ValueError("A license key is required to sign up")
        return v


@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    One step: license key + email + password creates the account AND
    activates the license against it — no separate "activate later in
    Settings" step. This is the multi-tenant self-serve signup flow;
    ALLOWED_USERS in .env is now only an optional bootstrap for a fixed
    account (see provision_allowed_users below), not how customers sign up.
    """
    email = data.email.lower()

    # A light rate limit here too — registration hits the license table
    # and creates DB rows, worth capping regardless of the license key
    # itself being the main gate.
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"register_attempts:{client_ip}"
    attempts = await redis_client.incr(rl_key, expire=3600)
    if attempts > 10:
        raise HTTPException(429, "Too many registration attempts from this address. Try again later.")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "An account with this email already exists")

    # Validate the license key BEFORE creating anything — a bad key should
    # never leave a half-created account behind.
    domain = settings.PUBLIC_BASE_URL or "localhost"
    result = await license_service.activate(data.license_key, domain)
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Invalid or already-used license key"))

    user = User(
        email=email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    company = Company(
        owner_id=user.id,
        name=f"{data.full_name}'s Company",
        license_key=data.license_key,
        license_domain=domain,
        license_tier=result.get("tier"),
        license_status="active",
        license_expires_at=license_service._parse_dt(result.get("expires_at")),
    )
    db.add(company)
    await db.commit()

    logger.info(f"New self-registered account: {email} | license={data.license_key} | tier={result.get('tier')}")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user_id=user.id, full_name=user.full_name, email=user.email)


# ─────────────────────────────────────────────────────────────────────────────
# POST /change-password — logged-in users only. There is deliberately no
# logged-out "forgot password" flow (no email system) — a locked-out user
# contacts an admin, who resets their password via POST
# /api/v1/admin/users/{id}/reset-password, and the user changes it here
# afterward.
# ─────────────────────────────────────────────────────────────────────────────
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, v):
        return _password_strength(v)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(400, "New password must be different from your current password")

    current_user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return {"success": True, "message": "Password updated"}


# ─────────────────────────────────────────────────────────────────────────────
# Startup provisioning — called from app/main.py's lifespan
# ─────────────────────────────────────────────────────────────────────────────
async def provision_allowed_users(allowed_users_env: str) -> int:
    """
    Parses ALLOWED_USERS="email:password,email2:password2" and upserts each
    into the local `users` table:
      - New email → creates the User + a placeholder Company (so license
        activation and everything else that's company-scoped works
        immediately, same as the old registration flow used to do).
      - Existing email, password changed in .env → updates the stored hash,
        so you can rotate a client's password by editing .env and
        restarting.
      - Existing email, same password → no-op.
    Returns the number of accounts provisioned.
    """
    import logging
    logger = logging.getLogger(__name__)

    pairs = []
    for chunk in (allowed_users_env or "").split(","):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        email, _, password = chunk.partition(":")
        email, password = email.strip().lower(), password.strip()
        if email and password:
            pairs.append((email, password))

    if not pairs:
        logger.warning("ALLOWED_USERS is empty or malformed — no accounts provisioned, nobody can log in")
        return 0

    count = 0
    async with AsyncSessionLocal() as db:
        for email, password in pairs:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            new_hash = hash_password(password)
            if user:
                if not verify_password(password, user.hashed_password):
                    user.hashed_password = new_hash
                    logger.info(f"Password updated for {email}")
                if not user.is_active:
                    user.is_active = True
            else:
                user = User(
                    email=email,
                    full_name=email.split("@")[0].replace(".", " ").title(),
                    hashed_password=new_hash,
                    is_active=True,
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

                # Auto-create the single Company for this account, same as
                # the old registration flow did.
                r = await db.execute(select(Company).where(Company.owner_id == user.id))
                if not r.scalar_one_or_none():
                    db.add(Company(owner_id=user.id, name=f"{user.full_name}'s Company"))
                logger.info(f"Provisioned new account: {email}")

            count += 1

        await db.commit()

    return count
