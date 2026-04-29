"""
ORION-ELITE: Driver Execution Layer API — Phase 2A
Implements the complete driver workflow:
  A. Route Reception      → GET /driver/route/{driver_id}
  B. Task Execution       → POST /driver/complete/{stop_id}
  C. Delay Reporting      → POST /driver/report-delay/{stop_id}
  D. Feedback Loop        → POST /driver/feedback
  E. Pickup Request       → POST /driver/pickup/{driver_id}
"""
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import json, datetime

from app.db.database import get_db
from app.models.db_models import Order, DriverIntentLog, ReOptEvent
from app.core.logger import logger
from app.core.config import config
from app.services.firebase_db_service import firebase_db_service

router = APIRouter(prefix="/driver", tags=["Driver Workflow"])


# ── A. Route Reception ────────────────────────────────────────────────────────

@router.get("/route/{driver_id}")
async def get_driver_route(driver_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns the current assigned, ordered stop sequence for a driver.
    - If orders are only 'assigned', it means the route is being calibrated (Show 'Dispatching...')
    - If orders are 'published', it means the route is ready (Show 'Active Route')
    """
    result = await db.execute(
        select(Order)
        .where(Order.assigned_vehicle_id == driver_id)
        .where(Order.status.in_(["assigned", "published", "in_transit", "pending"]))
        .order_by(Order.sequence_order.asc().nulls_last(), Order.priority.desc())
    )
    orders = result.scalars().all()

    # Check if any orders are published
    is_published = any(o.status in ["published", "in_transit"] for o in orders)
    
    if not orders:
        return {
            "driver_id": driver_id,
            "status": "no_route",
            "message": "No routes assigned for today.",
            "stops": []
        }

    if not is_published:
        return {
            "driver_id": driver_id,
            "status": "dispatching",
            "message": "Dispatching...",
            "stops": []
        }

    stops = []
    for o in orders:
        if o.status in ["assigned", "pending"]: 
            # If some are assigned but we are in published mode, treat them as upcoming
            pass
            
        stops.append({
            "id": o.id,
            "customer_name": o.customer_name,
            "lat": o.destination_lat,
            "lng": o.destination_lng,
            "status": o.status,
            "priority": o.priority,
            "stop_type": o.stop_type,
            "time_window_end": o.time_window_end,
            "weight_kg": o.weight_kg or 0.0,
            "volume_m3": o.volume_m3 or 0.0,
            "demand_units": o.demand_units,
            "sequence": o.sequence_order or 0,
        })

    return {
        "driver_id": driver_id,
        "status": "active",
        "stops": stops,
        "total_stops": len(stops),
        "completed": sum(1 for o in orders if o.status == "completed"),
        "shift_start": "08:00",
        "generated_at": datetime.datetime.utcnow().isoformat(),
    }


# ── B. Task Execution: Proof of Delivery ──────────────────────────────────────

@router.post("/complete/{stop_id}")
async def complete_stop(
    stop_id: int,
    driver_id: str = Form(...),
    outcome: str = Form(...),           # delivered | failed | skipped
    proof_type: str = Form("none"),     # photo | barcode | signature | none
    proof_data: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    actual_lat: Optional[float] = Form(None),
    actual_lng: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Driver marks a stop as delivered / failed / skipped.
    Captures proof-of-delivery (photo, barcode, signature).
    Logs location deviation for ML intent learning.
    """
    result = await db.execute(select(Order).where(Order.id == stop_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail=f"Stop {stop_id} not found")

    # Map driver outcome → DB status
    status_map = {"delivered": "completed", "failed": "failed", "skipped": "pending"}
    order.status = status_map.get(outcome, "completed")
    order.actual_completion_time = datetime.datetime.utcnow().isoformat()

    # Store proof as JSON blob
    proof_record = {
        "type": proof_type,
        "data": (proof_data[:500] if proof_data else None),
        "notes": notes,
        "actual_lat": actual_lat,
        "actual_lng": actual_lng,
        "captured_at": datetime.datetime.utcnow().isoformat(),
    }
    order.proof_of_delivery = json.dumps(proof_record)

    # ── Intent Learning: Log GPS deviation ────────────────────────────────────
    if actual_lat and actual_lng and order.destination_lat:
        lat_diff = abs(actual_lat - order.destination_lat)
        lng_diff = abs(actual_lng - order.destination_lng)
        if lat_diff > 0.001 or lng_diff > 0.001:   # ~110m threshold
            intent = DriverIntentLog(
                driver_id=driver_id,
                vehicle_id=driver_id,
                from_node=str(stop_id),
                to_node=f"{order.destination_lat:.5f},{order.destination_lng:.5f}",
                from_lat=actual_lat,
                from_lng=actual_lng,
                to_lat=order.destination_lat,
                to_lng=order.destination_lng,
                avoidance_reason=f"Delivery at ({actual_lat:.5f},{actual_lng:.5f}), planned ({order.destination_lat:.5f},{order.destination_lng:.5f})",
            )
            db.add(intent)

    await db.commit()
    logger.info(f"[DRIVER] Stop {stop_id} marked '{outcome}' by driver {driver_id}. Proof: {proof_type}")

    # ── Sync to Firebase ──
    try:
        await firebase_db_service.update_order_status(str(stop_id), order.status, {
            "proof": proof_record,
            "completed_at": order.actual_completion_time
        })
        await firebase_db_service.log_driver_event(driver_id, "stop_completion", f"Stop {stop_id} marked {outcome}", {
            "order_id": stop_id,
            "outcome": outcome
        })
    except Exception as f_err:
        logger.warning(f"Failed to sync stop completion for {stop_id} to Firebase: {f_err}")

    return {
        "success": True,
        "stop_id": stop_id,
        "new_status": order.status,
        "proof_logged": proof_type != "none",
        "intent_logged": (actual_lat is not None),
        "message": f"Stop marked as {outcome}.",
    }


# ── C. Delay Reporting → Triggers Re-Optimization ────────────────────────────

@router.post("/report-delay/{driver_id}")
async def report_delay(
    driver_id: str,
    stop_id: int = Form(...),
    delay_minutes: int = Form(...),
    reason: str = Form("traffic"),
    current_lat: Optional[float] = Form(None),
    current_lng: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Driver reports a delay. If ≥10 min, auto-triggers re-optimization
    for all vehicles whose remaining routes are impacted.
    """
    import redis.asyncio as aioredis

    # Publish to Redis → picked up by ReOptimizationService
    reopt_triggered = delay_minutes >= 10
    try:
        r = aioredis.from_url(config.REDIS_URL)
        event = {
            "type": "driver_delay",
            "driver_id": driver_id,
            "stop_id": stop_id,
            "delay_minutes": delay_minutes,
            "reason": reason,
            "current_location": {"lat": current_lat, "lng": current_lng},
            "trigger_reopt": reopt_triggered,
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }
        await r.publish("reopt_events", json.dumps(event))
        await r.aclose()
    except Exception as e:
        logger.warning(f"[DRIVER] Redis publish skipped: {e}")

    # Audit log in DB
    reopt_event = ReOptEvent(
        trigger=f"driver_delay",
        trigger_data={"driver_id": driver_id, "stop_id": stop_id, "delay_minutes": delay_minutes, "reason": reason},
        affected_vehicle_ids=[driver_id],
        status="success" if reopt_triggered else "skipped",
    )
    db.add(reopt_event)
    await db.commit()

    # ── Sync to Firebase ──
    try:
        await firebase_db_service.log_driver_event(driver_id, "delay_report", f"Delay of {delay_minutes}min reported", {
            "stop_id": stop_id,
            "delay_minutes": delay_minutes,
            "reason": reason
        })
        if current_lat and current_lng:
            await firebase_db_service.update_telemetry(driver_id, current_lat, current_lng, {"status": "delayed"})
    except Exception as f_err:
        logger.warning(f"Failed to sync delay report for {driver_id} to Firebase: {f_err}")

    return {
        "success": True,
        "delay_minutes": delay_minutes,
        "reopt_triggered": reopt_triggered,
        "message": f"Delay of {delay_minutes}min logged. {'Re-optimization queued for affected routes.' if reopt_triggered else 'Monitoring.'}",
    }


# ── D. Feedback Loop ──────────────────────────────────────────────────────────

@router.post("/feedback")
async def submit_feedback(
    driver_id: str = Form(...),
    route_id: str = Form(...),
    feedback_type: str = Form(...),   # sequence_change | road_blocked | customer_absent | time_override
    original: str = Form("[]"),       # JSON list
    modified: str = Form("[]"),       # JSON list
    reason: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    """
    Driver feedback loop: logs manual route changes and deviations.
    Data is consumed by the intent-learning pipeline to improve future solves.
    """
    try:
        orig = json.loads(original)
        mod = json.loads(modified)
    except Exception:
        orig, mod = [], []

    intent = DriverIntentLog(
        driver_id=driver_id,
        vehicle_id=driver_id,
        from_node=route_id,
        to_node=feedback_type,
        avoidance_reason=reason,
    )
    db.add(intent)
    await db.commit()

    logger.info(f"[DRIVER] Intent feedback from {driver_id}: {feedback_type}")
    return {"success": True, "feedback_type": feedback_type, "message": "Feedback logged for route learning."}


# ── E. New Pickup Request ─────────────────────────────────────────────────────

@router.post("/pickup/{driver_id}")
async def add_pickup(
    driver_id: str,
    customer_name: str = Form(...),
    dest_lat: float = Form(...),
    dest_lng: float = Form(...),
    priority: int = Form(7),
    db: AsyncSession = Depends(get_db),
):
    """
    Adds an emergency pickup to a driver's active route.
    Publishes a new-order event to trigger incremental re-optimization.
    """
    import redis.asyncio as aioredis

    # Create the order
    new_order = Order(
        customer_name=customer_name,
        destination_lat=dest_lat,
        destination_lng=dest_lng,
        status="assigned",
        assigned_vehicle_id=driver_id,
        priority=priority,
        stop_type="Pickup",
    )
    db.add(new_order)
    await db.flush()   # Get the ID before commit

    # Trigger incremental re-opt
    try:
        r = aioredis.from_url(config.REDIS_URL)
        await r.publish("reopt_events", json.dumps({
            "type": "new_order",
            "driver_id": driver_id,
            "order_id": new_order.id,
            "lat": dest_lat,
            "lng": dest_lng,
            "priority": priority,
        }))
        await r.aclose()
    except Exception as e:
        logger.warning(f"[DRIVER] Pickup Redis publish skipped: {e}")

    await db.commit()

    # ── Sync to Firebase ──
    try:
        await firebase_db_service.add_order({
            "id": str(new_order.id),
            "customer_name": customer_name,
            "lat": dest_lat,
            "lng": dest_lng,
            "priority": priority,
            "status": "assigned",
            "assigned_vehicle_id": driver_id,
            "stop_type": "Pickup",
            "created_at": datetime.datetime.utcnow().isoformat()
        })
        await firebase_db_service.log_driver_event(driver_id, "new_pickup", f"New pickup requested for {customer_name}")
    except Exception as f_err:
        logger.warning(f"Failed to sync pickup order {new_order.id} to Firebase: {f_err}")

    return {"success": True, "order_id": new_order.id, "message": f"Pickup assigned to {driver_id}. Re-optimization queued."}
