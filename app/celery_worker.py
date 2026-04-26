import os
import sys
import asyncio
import warnings
from celery import Celery

# Suppress sklearn version mismatch warnings for cleaner production logs
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

# ── CRITICAL: Ensure project root is in sys.path ──────────────────────────────
# Celery worker processes do NOT reliably inherit PYTHONPATH from the parent
# shell, causing `ModuleNotFoundError: No module named 'routing'`.
# Inserting the project root here resolves it for ALL pool types.
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from app.config import config

# Initialize Celery
celery_app = Celery(
    "tnimpact_worker",
    broker=config.REDIS_URL,
    backend=config.REDIS_URL
)

# Configuration for Production stability
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,      # 5 min limit for VRP solves
    task_soft_time_limit=270, # Soft limit: task can clean up gracefully
    worker_prefetch_multiplier=1,  # Prevent task starvation
    task_acks_late=True,           # Task is acknowledged after completion (safe retry)
    result_expires=3600,           # Keep results for 1 hour
)

@celery_app.task(name="app.celery_worker.optimize_vrp_task")
def optimize_vrp_task(office, vehicles, stops):
    """
    Background Task: Executes the OR-Tools VRP Solver and persists results.
    """
    from routing.vrp_solver import vrp_solver
    from app.utils.database import async_session
    from app.models.db_models import TripHistory
    
    # Python 3.10+ removed implicit loop creation in get_event_loop().
    # Celery tasks run in a fresh thread with no loop — always create one.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            vrp_solver.solve_vrp(office, vehicles, stops)
        )
    except Exception as exc:
        loop.close()
        raise exc
    finally:
        if not loop.is_closed():
            loop.close()

    # PERSISTENCE: Archive the result for Industrial Auditing
    if result and result.get("status") == "Success":
        async def save_history():
            async with async_session() as session:
                try:
                    summary = result.get("summary", {})
                    history = TripHistory(
                        total_distance_km=summary.get("total_distance_km", 0),
                        total_duration_min=summary.get("total_duration_min", 0),
                        total_cost=summary.get("total_cost", 0),
                        total_fuel_litres=summary.get("total_fuel_litres", 0),
                        vehicles_count=summary.get("total_vehicles_used", 0),
                        stops_count=len(stops),
                        raw_results=result.get("routes", []),
                        optimization_score=result.get("optimization_score", 0)
                    )
                    session.add(history)
                    await session.commit()
                except Exception as db_err:
                    print(f"Database Archiving Failed: {db_err}")

        loop2 = asyncio.new_event_loop()
        asyncio.set_event_loop(loop2)
        try:
            loop2.run_until_complete(save_history())
        finally:
            loop2.close()

    return _json_safe(result)


def _json_safe(obj):
    """
    Recursively converts any Pydantic BaseModel instances (and nested structures)
    to plain Python dicts so Celery's JSON serializer can handle them.
    """
    if hasattr(obj, 'model_dump'):          # Pydantic v2
        return _json_safe(obj.model_dump())
    elif hasattr(obj, 'dict'):              # Pydantic v1 fallback
        return _json_safe(obj.dict())
    elif isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_json_safe(i) for i in obj]
    else:
        return obj
