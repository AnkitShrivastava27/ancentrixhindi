"""
Live Call Tracking — WebSocket broadcaster

Architecture:
  - One WebSocket connection per browser tab at /api/v1/live/ws?company_id=...
  - vobiz_webhook.py calls live_broadcaster.emit(company_id, event) at each
    call lifecycle point (call_start, transcript, ai_reply, call_end).
  - LiveBroadcaster fans the event out to every connected WS for that company.
  - No Redis pub/sub needed — single-process in-memory fan-out.
    (If you move to multi-worker uvicorn, swap _connections to Redis pub/sub.)

Event shapes:
  { "type": "call_start",  "call_uuid": "...", "phone": "...", "mode": "...", "started_at": "..." }
  { "type": "user_msg",    "call_uuid": "...", "text": "...", "ts": "..." }
  { "type": "ai_msg",      "call_uuid": "...", "text": "...", "ts": "..." }
  { "type": "call_end",    "call_uuid": "...", "duration_sec": 0, "ended_at": "..." }
  { "type": "ping" }
"""
import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


class LiveBroadcaster:
    def __init__(self):
        # company_id → set of active WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    def _now(self) -> str:
        return datetime.utcnow().isoformat() + "Z"

    async def connect(self, company_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[company_id].add(ws)
        logger.info(f"Live WS connected | company={company_id[:8]} | total={len(self._connections[company_id])}")

    def disconnect(self, company_id: str, ws: WebSocket):
        self._connections[company_id].discard(ws)
        logger.info(f"Live WS disconnected | company={company_id[:8]} | remaining={len(self._connections[company_id])}")

    async def emit(self, company_id: str, event: dict):
        """Fan-out event to all connected clients for this company."""
        if not company_id or company_id not in self._connections:
            return
        dead: List[WebSocket] = []
        payload = json.dumps(event)
        for ws in list(self._connections[company_id]):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[company_id].discard(ws)

    # ── Convenience emit helpers called from tasks.py / vobiz_webhook ────────

    async def call_ringing(self, company_id: str, call_uuid: str, phone: str, mode: str, lead_name: str = ""):
        """Emitted the moment we dial out — before the callee has picked up."""
        await self.emit(company_id, {
            "type":       "call_ringing",
            "call_uuid":  call_uuid,
            "phone":      phone,
            "mode":       mode,
            "lead_name":  lead_name,
            "started_at": self._now(),
        })

    # Back-compat alias — call_start == call_ringing (kept so nothing else breaks)
    async def call_start(self, company_id: str, call_uuid: str, phone: str, mode: str):
        await self.call_ringing(company_id, call_uuid, phone, mode)

    async def call_answered(self, company_id: str, call_uuid: str):
        """Emitted once the callee actually picks up."""
        await self.emit(company_id, {
            "type":        "call_answered",
            "call_uuid":   call_uuid,
            "answered_at": self._now(),
        })

    async def call_no_answer(self, company_id: str, call_uuid: str, reason: str = "no_answer"):
        """Emitted when the callee never picks up (rang out, busy, failed)."""
        await self.emit(company_id, {
            "type":      "call_no_answer",
            "call_uuid": call_uuid,
            "reason":    reason,
            "ended_at":  self._now(),
        })

    async def user_msg(self, company_id: str, call_uuid: str, text: str):
        await self.emit(company_id, {
            "type":      "user_msg",
            "call_uuid": call_uuid,
            "text":      text,
            "ts":        self._now(),
        })

    async def ai_msg(self, company_id: str, call_uuid: str, text: str):
        await self.emit(company_id, {
            "type":      "ai_msg",
            "call_uuid": call_uuid,
            "text":      text,
            "ts":        self._now(),
        })

    async def call_end(self, company_id: str, call_uuid: str, duration_sec: int = 0):
        await self.emit(company_id, {
            "type":         "call_end",
            "call_uuid":    call_uuid,
            "duration_sec": duration_sec,
            "ended_at":     self._now(),
        })


# Singleton — imported by vobiz_webhook.py
live_broadcaster = LiveBroadcaster()


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def live_ws(websocket: WebSocket, company_id: str):
    """
    Connect: ws://<host>/api/v1/live/ws?company_id=<uuid>
    Stays open indefinitely; server pushes events as they happen.
    Client sends nothing (ping frames handled by keep-alive below).
    """
    if not company_id:
        await websocket.close(code=4001)
        return

    await live_broadcaster.connect(company_id, websocket)
    try:
        # Keep-alive: send ping every 25s so the connection doesn't timeout
        # through Cloudflare (which drops idle WS at 100s).
        while True:
            await asyncio.sleep(25)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Live WS error: {e}")
    finally:
        live_broadcaster.disconnect(company_id, websocket)
