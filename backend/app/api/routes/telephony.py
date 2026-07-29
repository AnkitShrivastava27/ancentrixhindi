"""
Telephony utility routes — small helper endpoints used by the frontend.

The actual call flow (answer/gather/hangup XML webhooks) lives entirely in
vobiz_webhook.py now that Telnyx has been removed. This file only exposes:
  GET  /telephony/numbers            — the company's configured Vobiz DID
  POST /telephony/calls/{cid}/hangup — force-hangup a live call
  GET  /telephony/calls/{cid}/transcript — last live transcript line
"""
import logging
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_current_active_user
from app.models.models import Company
from app.services.telephony.call_session import session_manager
from app.services.telephony.vobiz_service import vobiz_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/numbers")
async def list_numbers(current_user=Depends(get_current_active_user)) -> List[dict]:
    """Vobiz has no numbers-lookup API — return whatever DID(s) are configured
    on the current user's company instead of a carrier-wide list."""
    async with AsyncSessionLocal() as db:
        owner_id = current_user.get("uid") if isinstance(current_user, dict) else current_user.id
        r = await db.execute(select(Company).where(Company.owner_id == owner_id))
        company = r.scalar_one_or_none()
        if not company or not company.vobiz_phone_number:
            return []
        return [{"number": company.vobiz_phone_number, "status": "active"}]


@router.post("/calls/{cid}/hangup")
async def force_hangup(cid: str, current_user=Depends(get_current_active_user)):
    return {"success": await vobiz_service.hangup(cid)}


@router.get("/calls/{cid}/transcript")
async def live_transcript(cid: str, current_user=Depends(get_current_active_user)):
    return {"transcript": await session_manager.get_live_transcript(cid)}
