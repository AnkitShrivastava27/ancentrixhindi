# app/api/routes/payments.py
# Cashfree minute-based plan payments — REPLACES app/api/routes/license.py
# and the old yearly activation-key system entirely. See
# app/services/plan_service.py for pricing/balance logic and
# app/services/payment/cashfree_service.py for the Cashfree REST calls.

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.rate_limit import rate_limit
from app.core.security import get_current_active_user
from app.models.models import Company, PaymentOrder
from app.services import plan_service
from app.services.payment import cashfree_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])


async def _get_or_create_company_for_user(current_user, db) -> Company:
    """Mirrors license.py's helper — single-tenant product, one Company per user."""
    owner_id = current_user.get("uid") if isinstance(current_user, dict) else current_user.id
    r = await db.execute(select(Company).where(Company.owner_id == owner_id))
    company = r.scalar_one_or_none()
    if company:
        return company
    full_name = current_user.get("full_name") if isinstance(current_user, dict) else current_user.full_name
    company = Company(owner_id=owner_id, name=f"{full_name}'s Company" if full_name else "My Company")
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


# ─────────────────────────────────────────────────────────────────────────────
# GET /payments/plans — static plan catalogue for the pricing/upgrade screen
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/plans")
async def list_plans():
    return {
        "plans": [
            {**plan_service.price_plan("trial"), "label": "Trial", "one_time_only": True},
            {**plan_service.price_plan("basic"), "label": "Basic"},
            {**plan_service.price_plan("standard"), "label": "Standard"},
            {
                "plan_type": "custom",
                "label": "Custom",
                "rate_per_minute": settings.PLAN_CUSTOM_RATE_PER_MINUTE,
                "min_amount": settings.PLAN_CUSTOM_MIN_AMOUNT,
                "note": "Enter any amount ≥ ₹1000 — minutes = amount / ₹4.3",
            },
        ],
        "expiry_days": settings.PLAN_EXPIRY_DAYS,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /payments/balance — feeds the Home page minutes-remaining widget
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/balance")
async def get_balance(current_user=Depends(get_current_active_user)):
    async with AsyncSessionLocal() as db:
        company = await _get_or_create_company_for_user(current_user, db)
        return plan_service.balance_summary(company)


# ─────────────────────────────────────────────────────────────────────────────
# GET /payments/orders/{order_id} — polled by the frontend's /billing/return
# page after Cashfree redirects back, to find out whether the webhook has
# already landed and credited the plan.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/orders/{order_id}")
async def get_order(order_id: str, current_user=Depends(get_current_active_user)):
    async with AsyncSessionLocal() as db:
        company = await _get_or_create_company_for_user(current_user, db)
        r = await db.execute(
            select(PaymentOrder).where(
                PaymentOrder.cf_order_id == order_id,
                PaymentOrder.company_id == company.id,   # scoped — can't peek at another company's order
            )
        )
        order = r.scalar_one_or_none()
        if not order:
            raise HTTPException(404, "Order not found")
        return {
            "order_id": order.cf_order_id,
            "status": order.status,   # created | paid | failed
            "plan_type": order.plan_type,
            "minutes": order.minutes,
            "amount": order.amount,
        }


# ─────────────────────────────────────────────────────────────────────────────
# POST /payments/create-order — starts a Cashfree checkout for one plan
# ─────────────────────────────────────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    plan_type: str                       # trial | basic | standard | custom
    custom_amount: Optional[float] = None  # required if plan_type == "custom"
    customer_phone: str
    customer_email: Optional[str] = None


@router.post("/create-order", dependencies=[Depends(rate_limit("create_order", 10, 3600))])
async def create_order(body: CreateOrderRequest, current_user=Depends(get_current_active_user)):
    # Magic-link email verification gate (Aug 2026) — enforced here, not
    # just as a frontend redirect, so this can't be bypassed by hitting
    # the API directly. See app/api/routes/auth.py for the verification
    # flow itself.
    is_verified = current_user.get("email_verified") if isinstance(current_user, dict) else current_user.email_verified
    if not is_verified:
        raise HTTPException(403, "Please verify your email before purchasing a plan.")

    async with AsyncSessionLocal() as db:
        company = await _get_or_create_company_for_user(current_user, db)

        try:
            priced = plan_service.price_plan(body.plan_type, body.custom_amount)
            plan_service.assert_purchasable(company, priced["plan_type"])
        except plan_service.PlanError as e:
            raise HTTPException(400, str(e))

        if not settings.PUBLIC_BASE_URL:
            raise HTTPException(500, "PUBLIC_BASE_URL is not configured — required to build Cashfree's notify_url (server-to-server webhook)")

        order_id = f"acx_{uuid.uuid4().hex[:20]}"
        # return_url: the PERSON'S OWN BROWSER navigates here after
        # checkout — never needs to be public. FRONTEND_PUBLIC_URL falls
        # back to PUBLIC_BASE_URL if unset (single-domain production
        # setups keep working unchanged either way).
        frontend_base = settings.FRONTEND_PUBLIC_URL or settings.PUBLIC_BASE_URL
        return_url = f"{frontend_base.rstrip('/')}/billing/return?order_id={order_id}"
        # notify_url: Cashfree's SERVERS call this — genuinely needs to be
        # internet-reachable (a real domain, or a tunnel in local dev).
        notify_url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/payments/webhook"

        try:
            cf_response = await cashfree_service.create_order(
                order_id=order_id,
                order_amount=priced["amount"],
                customer_id=company.id,
                customer_phone=body.customer_phone,
                customer_email=body.customer_email,
                return_url=return_url,
                notify_url=notify_url,
            )
        except cashfree_service.CashfreeError as e:
            logger.error(f"Cashfree create_order failed for company={company.id}: {e}")
            raise HTTPException(502, "Payment gateway error — could not start checkout. Please try again.")

        order = PaymentOrder(
            company_id=company.id,
            cf_order_id=order_id,
            cf_cf_order_id=cf_response.get("cf_order_id"),
            plan_type=priced["plan_type"],
            minutes=round(priced["minutes"]),
            rate_per_minute=priced["rate_per_minute"],
            amount=priced["amount"],
            status="created",
            payment_session_id=cf_response.get("payment_session_id"),
            raw_create_response=cf_response,
        )
        db.add(order)
        await db.commit()

        return {
            "order_id": order_id,
            "payment_session_id": cf_response.get("payment_session_id"),
            "plan_type": priced["plan_type"],
            "minutes": priced["minutes"],
            "amount": priced["amount"],
            "cashfree_env": settings.CASHFREE_ENV,
        }


# ─────────────────────────────────────────────────────────────────────────────
# POST /payments/webhook — Cashfree server-to-server payment notification
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/webhook")
async def cashfree_webhook(request: Request):
    """No auth dependency here on purpose — this is called BY Cashfree,
    not by a logged-in user. Authenticity comes entirely from the HMAC
    signature check below; never trust this payload without it."""
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature", "")
    timestamp = request.headers.get("x-webhook-timestamp", "")

    if not cashfree_service.verify_webhook_signature(raw_body, signature, timestamp):
        logger.warning("Cashfree webhook: signature verification FAILED — rejecting")
        raise HTTPException(401, "Invalid signature")

    payload = await request.json()
    data = payload.get("data", {})
    order_data = data.get("order", {})
    payment_data = data.get("payment", {})

    order_id = order_data.get("order_id")
    payment_status = (payment_data.get("payment_status") or "").upper()  # SUCCESS | FAILED | ...
    event_type = payload.get("type", "")

    if not order_id:
        logger.warning(f"Cashfree webhook: no order_id in payload | type={event_type}")
        return {"received": True}

    async with AsyncSessionLocal() as db:
        r = await db.execute(select(PaymentOrder).where(PaymentOrder.cf_order_id == order_id))
        order = r.scalar_one_or_none()
        if not order:
            logger.error(f"Cashfree webhook: no local PaymentOrder for order_id={order_id}")
            return {"received": True}

        # Fast path for an already-committed payment.
        if order.status == "paid":
            return {"received": True, "already_processed": True}

        # Do NOT rely only on the read-above status check. Cashfree can deliver
        # the same SUCCESS webhook more than once (and can deliver them close
        # together). Two requests can otherwise both observe status="created"
        # and both credit the company. Atomically claim the order here; only
        # the request that changes created/failed -> processing may continue.
        claim = await db.execute(
            update(PaymentOrder)
            .where(
                PaymentOrder.cf_order_id == order_id,
                PaymentOrder.status.in_(["created", "failed"]),
            )
            .values(status="processing", raw_webhook_payload=payload)
        )
        await db.commit()

        if claim.rowcount != 1:
            return {"received": True, "already_processed": True}

        # Re-load the claimed order in this transaction/session.
        r = await db.execute(select(PaymentOrder).where(PaymentOrder.cf_order_id == order_id))
        order = r.scalar_one()

        if payment_status != "SUCCESS":
            order.status = "failed"
            await db.commit()
            return {"received": True}

        # Server-side confirmation — don't trust the webhook payload alone
        # for the actual credit decision, re-fetch the order from Cashfree
        # directly (per Cashfree's own recommendation).
        try:
            confirmed = await cashfree_service.fetch_order(order_id)
        except cashfree_service.CashfreeError as e:
            logger.error(f"Cashfree webhook: fetch_order confirmation failed for {order_id}: {e}")
            # Release the claim so Cashfree's retry can safely try again.
            order.status = "created"
            await db.commit()
            raise HTTPException(502, "Could not confirm order status")

        if (confirmed.get("order_status") or "").upper() != "PAID":
            logger.warning(f"Cashfree webhook: SUCCESS payment event but fetch_order shows '{confirmed.get('order_status')}' for {order_id} — not crediting")
            order.status = "created"
            await db.commit()
            return {"received": True}

        r2 = await db.execute(select(Company).where(Company.id == order.company_id))
        company = r2.scalar_one_or_none()
        if not company:
            logger.error(f"Cashfree webhook: no Company for order {order_id} (company_id={order.company_id})")
            return {"received": True}

        priced = {
            "plan_type": order.plan_type,
            "minutes": order.minutes,
            "rate_per_minute": order.rate_per_minute,
            "amount": order.amount,
        }
        plan_service.apply_paid_plan(company, priced)

        order.status = "paid"
        from datetime import datetime
        order.paid_at = datetime.utcnow()

        await db.commit()
        logger.info(f"Cashfree webhook: credited {order.minutes} min ({order.plan_type}) to company={company.id} | order={order_id}")
        return {"received": True, "credited": True}
