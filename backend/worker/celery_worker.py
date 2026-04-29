"""
ORION-ELITE: Extended Celery Worker
Added incremental re-optimization task that integrates with the Re-Opt Service.
"""
import os
import sys
import asyncio
import warnings
import json
import time

warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from celery import Celery
from app.config import config

celery_app = Celery(
    "tnimpact_worker",
    broker=config.REDIS_URL,
    backend=config.REDIS_URL
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_soft_time_limit=270,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    result_expires=3600,
)


@celery_app.task(name="app.celery_worker.optimize_vrp_task")
def optimize_vrp_task(office, vehicles, stops):
    """Background Task: Full VRP solve with persistence and explainability."""
    from app.routing.vrp_solver import vrp_solver
    from app.routing.explainability import explainability_engine
    from app.utils.database import async_session
    from app.models.db_models import TripHistory

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    start_ms = time.time() * 1000

    try:
        result = loop.run_until_complete(
            vrp_solver.solve_vrp(office, vehicles, stops)
        )
    except Exception as exc:
        loop.close()
        raise exc

    elapsed_ms = time.time() * 1000 - start_ms

    # Generate explainability report
    if result and result.get("status") == "Success":
        explanation = explainability_engine.explain_global_solution(
            routes=result.get("routes", []),
            summary=result.get("summary", {}),
            num_stops=len(stops),
            num_vehicles=len(vehicles),
            solver_time_ms=elapsed_ms,
            alternatives_evaluated=5000
        )
        result["explanation"] = explanation

        async def save_history():
            async with async_session() as session:
                try:
                    summary = result.get("summary", {})
                    history = TripHistory(
                        total_distance_km=summary.get("total_distance_km", 0),
                        total_duration_min=summary.get("total_duration_min", 0),
                        total_cost=summary.get("total_cost", 0),
                        total_fuel_litres=summary.get("total_fuel_litres", 0),
                        total_co2_kg=summary.get("total_co2_kg", 0),
                        co2_saved_kg=summary.get("co2_saved_kg", 0),
                        vehicles_count=summary.get("total_vehicles_used", 0),
                        stops_count=len(stops),
                        raw_results=result.get("routes", []),
                        optimization_score=result.get("optimization_score", 0),
                        trigger="manual",
                        explainability_report=explanation
                    )
                    session.add(history)
                    await session.commit()
                except Exception as db_err:
                    print(f"[WORKER] Database Archiving Failed: {db_err}")

        loop2 = asyncio.new_event_loop()
        asyncio.set_event_loop(loop2)
        try:
            loop2.run_until_complete(save_history())
        finally:
            loop2.close()

    loop.close()
    return _json_safe(result)


@celery_app.task(name="app.celery_worker.run_incremental_reoptimization")
def run_incremental_reoptimization(task_payload: dict):
    """
    ORION-ELITE: Incremental re-optimization triggered by the Re-Opt Service.
    Only solves for affected vehicles, not the full fleet.
    """
    from app.routing.vrp_solver import vrp_solver
    from app.utils.database import async_session
    from app.models.db_models import ReOptEvent
    import redis as sync_redis
    import json as json_mod

    trigger = task_payload.get("trigger", "unknown")
    vehicle_ids = task_payload.get("vehicle_ids", "all")
    start_ms = time.time() * 1000

    # Fetch active state from Redis
    r = sync_redis.from_url(config.REDIS_URL, decode_responses=True)
    active_json = r.get("active:routes")
    if not active_json:
        return {"status": "skipped", "reason": "No active routes in cache"}

    active_state = json_mod.loads(active_json)
    office = active_state.get("office", {})
    all_vehicles = active_state.get("vehicles", [])
    all_stops = active_state.get("stops", [])

    # Filter to only affected vehicles
    if vehicle_ids != "all":
        filtered_vehicles = [v for v in all_vehicles
                             if str(v.get("vehicle_id")) in vehicle_ids]
    else:
        filtered_vehicles = all_vehicles

    if not filtered_vehicles or not all_stops:
        return {"status": "skipped", "reason": "No vehicles or stops to optimize"}

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            vrp_solver.solve_vrp_delta(
                office=office,
                vehicles=filtered_vehicles,
                stops=all_stops,
                current_state=active_state.get("current_driver_state", {})
            )
        )
    except Exception as e:
        loop.close()
        print(f"[REOPT WORKER] Solve failed: {e}")
        return {"status": "failed", "error": str(e)}
    finally:
        if not loop.is_closed():
            loop.close()

    elapsed_ms = time.time() * 1000 - start_ms

    # Publish updated routes to Redis for frontend consumption
    if result and result.get("status") == "Success":
        r.publish("route_updated", json_mod.dumps(_json_safe(result)))

    # Persist re-opt event
    async def save_reopt_event():
        async with async_session() as session:
            try:
                evt = ReOptEvent(
                    trigger=trigger,
                    trigger_data=task_payload,
                    affected_vehicle_ids=vehicle_ids if isinstance(vehicle_ids, list) else ["all"],
                    stops_rerouted=len(all_stops),
                    solver_time_ms=elapsed_ms,
                    status="success" if result else "failed"
                )
                session.add(evt)
                await session.commit()
            except Exception as e:
                print(f"[REOPT WORKER] Event log failed: {e}")

    loop3 = asyncio.new_event_loop()
    asyncio.set_event_loop(loop3)
    try:
        loop3.run_until_complete(save_reopt_event())
    finally:
        loop3.close()

    return _json_safe(result)


@celery_app.task(name="app.celery_worker.continuous_reoptimize_task")
def continuous_reoptimize_task(office, vehicles, stops, planned_multiplier):
    """Module 02: Drift Detection + Delta Patching."""
    from app.ml.predictor import predictor
    from app.routing.vrp_solver import vrp_solver
    from datetime import datetime

    now = datetime.now()
    current_multiplier = predictor.predict_multiplier(hour=now.hour, day_of_week=now.weekday())
    drift = abs(current_multiplier - planned_multiplier)

    if drift > 0.15:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                vrp_solver.solve_vrp_delta(office, vehicles, stops)
            )
            return _json_safe(result)
        finally:
            loop.close()

    return {"status": "Skipped", "reason": f"Drift {drift:.3f} below threshold."}


def _json_safe(obj):
    """Recursively converts Pydantic models to plain dicts for JSON serialization."""
    if hasattr(obj, 'model_dump'):
        return _json_safe(obj.model_dump())
    elif hasattr(obj, 'dict'):
        return _json_safe(obj.dict())
    elif isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_json_safe(i) for i in obj]
    else:
        return obj
