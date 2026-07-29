# app/api/routes/admin.py
#
# Merged-in replacement for the standalone "license app/" server. Every
# route here is gated by a single bearer token (settings.ADMIN_TOKEN) —
# there's no per-admin-user concept, this is meant for you (the operator),
# not a multi-admin system. Treat ADMIN_TOKEN like a root password:
#   - change it from the default in production
#   - only expose this panel to a trusted network (VPN / IP allowlist at
#     your reverse proxy / Azure App Service access restrictions) — the
#     token is the ONLY gate, there's no rate limiting or lockout on it
#     the way there is on user login.
#
# Covers what the standalone admin.html used to do (generate/list/revoke
# licenses) plus what it didn't (list users, reset a user's password —
# needed now that there's no "forgot password" email flow: a locked-out
# user contacts you, you reset it here, they change it in Settings).

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import redis_client
from app.core.security import hash_password
from app.models.models import Company, License, User
from app.services import license_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ADMIN_TOKEN is the only gate on every route in this file, and unlike
# user login it has no lockout of its own — anyone who can reach this
# path can hammer it with guessed tokens as fast as the network allows.
# This adds the same IP-keyed Redis rate limit login already has,
# counting failed attempts only (a correct token never counts against
# the limit, so normal admin-panel usage — which can easily be dozens of
# calls in a session — never gets throttled).
async def _require_admin(request: Request, authorization: str = Header(...)):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"admin_auth_fail:{client_ip}"

    attempts = await redis_client.get(rl_key) or 0
    if int(attempts) >= settings.ADMIN_RATE_LIMIT_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed admin auth attempts from this address. Try again later.",
        )

    if authorization != f"Bearer {settings.ADMIN_TOKEN}":
        await redis_client.incr(rl_key, expire=settings.ADMIN_RATE_LIMIT_WINDOW_SECONDS)
        raise HTTPException(401, "Invalid admin token")


# ─────────────────────────────────────────────────────────────────────────────
# Licenses
# ─────────────────────────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    client_name: str
    tier: str = "pro"
    years: int = 1
    notes: Optional[str] = None

    @field_validator("tier")
    @classmethod
    def _validate_tier(cls, v):
        if v not in license_service.TIER_LIMITS:
            raise ValueError(f"tier must be one of {list(license_service.TIER_LIMITS.keys())}")
        return v


class RevokeRequest(BaseModel):
    license_key: str
    reason: Optional[str] = None


@router.post("/generate", dependencies=[Depends(_require_admin)])
async def generate_license(data: GenerateRequest):
    key = license_service.generate_key()
    expires_at = datetime.utcnow() + timedelta(days=365 * data.years)

    async with AsyncSessionLocal() as db:
        db.add(License(
            key=key,
            client_name=data.client_name,
            tier=data.tier,
            status="inactive",
            notes=data.notes,
            expires_at=expires_at,
        ))
        await db.commit()

    return {
        "license_key": key,
        "client_name": data.client_name,
        "tier": data.tier,
        "expires_at": expires_at.isoformat(),
        "message": f"Share this key with {data.client_name} — they enter it on the signup page.",
    }


class ResetDomainRequest(BaseModel):
    license_key: str


@router.post("/reset-domain", dependencies=[Depends(_require_admin)])
async def reset_domain(data: ResetDomainRequest):
    """Un-binds a license from its currently-activated domain/account and
    sets it back to inactive, so it can be used to register a fresh
    account (e.g. the original signup failed halfway, or you're
    reassigning a key to a different customer)."""
    async with AsyncSessionLocal() as db:
        lic = await db.get(License, data.license_key.strip().upper())
        if not lic:
            raise HTTPException(404, "License key not found")
        lic.domain = None
        lic.status = "inactive"
        lic.activated_at = None
        await db.commit()
    return {"success": True, "message": f"Domain reset for {data.license_key} — ready to re-activate"}


@router.post("/revoke", dependencies=[Depends(_require_admin)])
async def revoke_license(data: RevokeRequest):
    async with AsyncSessionLocal() as db:
        lic = await db.get(License, data.license_key.strip().upper())
        if not lic:
            raise HTTPException(404, "License key not found")
        lic.status = "revoked"
        lic.revoked_at = datetime.utcnow()
        lic.revoke_reason = data.reason
        await db.commit()
    return {"success": True, "message": f"License revoked: {data.license_key}"}


@router.get("/licenses", dependencies=[Depends(_require_admin)])
async def list_licenses():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(License).order_by(License.created_at.desc()))
        licenses = result.scalars().all()

    now = datetime.utcnow()
    out = []
    for lic in licenses:
        days_left = (lic.expires_at - now).days if lic.expires_at else None
        out.append({
            "license_key": lic.key,
            "client_name": lic.client_name,
            "tier": lic.tier,
            "status": lic.status,
            "domain": lic.domain,
            "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
            "days_left": days_left,
            "activated_at": lic.activated_at.isoformat() if lic.activated_at else None,
            "last_validated_at": lic.last_validated_at.isoformat() if lic.last_validated_at else None,
            "notes": lic.notes,
        })
    return {"total": len(out), "licenses": out}


# ─────────────────────────────────────────────────────────────────────────────
# Users — needed since there's no self-serve "forgot password" (no email
# system). A locked-out user contacts you; you reset their password here;
# they change it themselves afterward in Settings.
# ─────────────────────────────────────────────────────────────────────────────
class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _validate(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.get("/users", dependencies=[Depends(_require_admin)])
async def list_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).order_by(User.created_at.desc()))
        users = result.scalars().all()

        out = []
        for u in users:
            r = await db.execute(select(Company).where(Company.owner_id == u.id))
            company = r.scalar_one_or_none()
            out.append({
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "company_name": company.name if company else None,
                "license_key": company.license_key if company else None,
                "license_tier": company.license_tier if company else None,
                "license_status": company.license_status if company else None,
            })
    return {"total": len(out), "users": out}


@router.post("/users/{user_id}/reset-password", dependencies=[Depends(_require_admin)])
async def reset_user_password(user_id: str, data: ResetPasswordRequest):
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(404, "User not found")
        user.hashed_password = hash_password(data.new_password)
        await db.commit()
    logger.info(f"Admin reset password for user_id={user_id}")
    return {"success": True, "message": f"Password reset for {user.email}. Share the new password with them directly."}


@router.post("/users/{user_id}/disable", dependencies=[Depends(_require_admin)])
async def disable_user(user_id: str):
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(404, "User not found")
        user.is_active = False
        await db.commit()
    return {"success": True, "message": f"Disabled {user.email}"}


@router.post("/users/{user_id}/enable", dependencies=[Depends(_require_admin)])
async def enable_user(user_id: str):
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(404, "User not found")
        user.is_active = True
        await db.commit()
    return {"success": True, "message": f"Enabled {user.email}"}
