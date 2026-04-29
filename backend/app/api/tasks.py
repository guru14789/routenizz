"""
ORION-ELITE: Extended Tasks Router
Added Server-Sent Events (SSE) endpoint for real-time frontend feed.
"""
import asyncio
import json
import time
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from celery.result import AsyncResult

from app.celery_worker import celery_app
from app.core.auth import require_admin
from app.core.logger import logger
import redis.asyncio as aioredis
from app.core.config import config

router = APIRouter()


@router.get("/status/{task_id}")
async def get_task_status(task_id: str, current_user: dict = Depends(require_admin)):
    """Checks the status of a background VRP optimization task."""
    try:
        task_result = AsyncResult(task_id, app=celery_app)
        response = {"task_id": task_id, "status": task_result.status, "result": None}
        if task_result.status == "SUCCESS":
            response["result"] = task_result.result
        elif task_result.status == "FAILURE":
            response["error"] = str(task_result.info)
            logger.error(f"Task {task_id} failed: {task_result.info}")
        return response
    except Exception as e:
        logger.error(f"Error checking task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal status check failure")


@router.get("/live-events")
async def live_events_stream():
    """
    ORION-ELITE PHASE 6: Server-Sent Events endpoint.
    Frontend subscribes here to receive real-time re-opt notifications.
    Subscribes to Redis 'route_updated' channel and streams events as SSE.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        redis = aioredis.from_url(config.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe("route_updated", "reopt_trigger", "traffic_update")

        # Send heartbeat immediately so client knows it's connected
        yield f"data: {json.dumps({'type': 'connected', 'message': 'ORION-ELITE stream active'})}\n\n"

        heartbeat_interval = 15  # seconds
        last_heartbeat = time.time()

        try:
            async for message in pubsub.listen():
                # Periodic heartbeat to keep connection alive through proxies
                if time.time() - last_heartbeat > heartbeat_interval:
                    yield f"data: {json.dumps({'type': 'heartbeat', 'ts': int(time.time())})}\n\n"
                    last_heartbeat = time.time()

                if message["type"] != "message":
                    continue

                channel = message["channel"]
                raw = message["data"]

                try:
                    payload = json.loads(raw)
                except Exception:
                    payload = {"raw": raw}

                # Map channel to event type
                evt_type = {
                    "route_updated": "route_updated",
                    "reopt_trigger": "manual",
                    "traffic_update": "traffic_update",
                }.get(channel, "default")

                sse_payload = {
                    "type": evt_type,
                    "message": _build_message(evt_type, payload),
                    "detail": _build_detail(evt_type, payload),
                    "impact": _build_impact(evt_type, payload),
                    "timestamp": time.time(),
                }

                yield f"data: {json.dumps(sse_payload)}\n\n"

        except asyncio.CancelledError:
            logger.info("[SSE] Client disconnected.")
        finally:
            await pubsub.unsubscribe()
            await redis.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",       # Disable Nginx buffering for SSE
            "Access-Control-Allow-Origin": "*",
        },
    )


def _build_message(evt_type: str, payload: dict) -> str:
    return {
        "route_updated": "[ROUTE UPDATE] Routes re-optimized by ORION-ELITE.",
        "traffic_update": f"[TRAFFIC] Drift {payload.get('drift_percent', '?')}% detected. Re-opt triggered.",
        "manual": "[MANUAL] Dispatcher triggered full re-optimization.",
        "default": f"[SYSTEM] Event received on channel.",
    }.get(evt_type, "[SYSTEM] Unknown event.")


def _build_detail(evt_type: str, payload: dict) -> str:
    if evt_type == "route_updated":
        summary = payload.get("summary", {})
        return (f"Vehicles: {summary.get('total_vehicles_used', '?')} | "
                f"Distance: {summary.get('total_distance_km', '?')}km | "
                f"Cost: ₹{summary.get('total_cost', '?')}")
    if evt_type == "traffic_update":
        segs = len(payload.get("affected_segments", []))
        return f"{segs} segments affected. Incremental delta-patch dispatched."
    return ""


def _build_impact(evt_type: str, payload: dict) -> dict | None:
    if evt_type == "route_updated":
        summary = payload.get("summary", {})
        co2_saved = summary.get("co2_saved_kg", 0)
        if co2_saved > 0:
            return {"label": f"-{co2_saved:.1f}kg CO₂", "positive": True}
    return None
