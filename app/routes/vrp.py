"""
USES: Defines the logical endpoints for Vehicle Routing Problem (VRP) optimization.
SUPPORT: Handles incoming optimization requests from the frontend and communicates with the VRPSolver to return cost-minimized routes.
"""
from fastapi import APIRouter, HTTPException, Depends  # Import FastAPI components for routing and error handling
from models.schemas import OptimizationRequest, OptimizationResponse  # Import Pydantic models for data validation
from routing.vrp_solver import vrp_solver  # Import the core logic for solving the routing problem
from services.realtime_router import realtime_router  # Import service for handling live telemetry updates
from app.utils.logger import logger  # Import the logging utility for tracking system activity
from app.utils.firebase_auth import require_admin, get_firebase_user  # Production Security Middleware
from app.celery_worker import optimize_vrp_task  # Async background task

router = APIRouter()  # Create an APIRouter instance to group related endpoints

@router.post("/optimize-route")
async def optimize_route(request: OptimizationRequest, current_user: dict = Depends(require_admin)):
    """
    Main Enterprise VRP Optimization Endpoint.
    Strategy: Tries async Celery dispatch first (non-blocking, returns task_id).
    Falls back to synchronous inline solve if Redis/Celery is unavailable — guarantees
    the frontend always receives a result.
    """
    try:
        # Attempt Celery dispatch (async, returns task_id for polling)
        task = optimize_vrp_task.delay(
            office=request.office.model_dump(),
            vehicles=[v.model_dump() for v in request.vehicles],
            stops=[s.model_dump() for s in request.stops]
        )
        logger.info(f"[VRP] Async task dispatched: {task.id}")
        return {
            "task_id": task.id,
            "status": "QUEUED",
            "message": "Optimization started in background."
        }
    except Exception as celery_err:
        # Celery unavailable (Redis down / no worker) — execute inline
        logger.warning(f"[VRP] Celery unavailable ({type(celery_err).__name__}). Running synchronous fallback.")
        try:
            result = await vrp_solver.solve_vrp(
                request.office.model_dump(),
                [v.model_dump() for v in request.vehicles],
                [s.model_dump() for s in request.stops]
            )
            # Return as a completed task so the frontend polling loop terminates
            return {
                "task_id": "SYNC-" + str(id(result)),
                "status": "SUCCESS",
                "result": result,
                "message": "Optimized inline (Celery fallback active)."
            }
        except Exception as e:
            logger.error(f"[VRP] Inline optimization also failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-position")
async def update_position(vehicle_id: str, lat: float, lng: float, current_user: dict = Depends(get_firebase_user)):
    """
    Real-time telemetry update endpoint. (Authenticated)
    """
    return await realtime_router.update_vehicle_position(vehicle_id, lat, lng)
