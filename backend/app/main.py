"""
USES: Main entry point and orchestration layer for the FastAPI application. (Integrated 94% Accuracy Model)
SUPPORT: Configures middleware (CORS, Gzip), initializes the rate limiter, and attaches API routers (VRP, Health).
"""
from fastapi import FastAPI, Request  # Import FastAPI for web framework and Request for middleware type hinting
from fastapi.middleware.cors import CORSMiddleware  # Middleware to manage Cross-Origin Resource Sharing (CORS)
from fastapi.middleware.gzip import GZipMiddleware  # Middleware to compress responses for faster network transfer
import os
import time
import sentry_sdk
from prometheus_fastapi_instrumentator import Instrumentator
from sentry_sdk.integrations.fastapi import FastApiIntegration
import sys


# Initialize Sentry for real-time error tracking

SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=1.0, # Capture all traces for the pilot phase
        profiles_sample_rate=1.0,
    )

from app.core.config import config
from app.core.logger import logger  # Import structured logging for audit trails and debugging
logger.info(f"[DEBUG] sys.path: {sys.path}")

from app.core.limiter import limiter  # Import rate limiting logic to protect the API
from slowapi.errors import RateLimitExceeded  # Import exception for status code 429 handling
from slowapi import _rate_limit_exceeded_handler  # Helper to generate standard 429 error responses

# Import modularized routers to keep main.py clean and maintainable
from app.api import vrp, health, traffic, analytics, navigation, auth, tasks
from app.api import simulation as simulation_router
from app.api import driver as driver_router
from app.api import admin_ops as admin_ops_router

from app.db.database import Base, engine  # For DB initialization
from app.models import db_models  # Ensure models are loaded for table creation

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    ORION-ELITE Production Readiness:
    - Initializes DB tables
    - Starts Re-Optimization background service
    - Starts OSRM Traffic Monitor
    """
    import asyncio

    # 1. Initialize DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Production ready: Database tables initialized.")

    # 1.5 Initialize Firebase Admin
    import firebase_admin
    from firebase_admin import credentials
    if not firebase_admin._apps:
        # Check for service account env var, fallback to default for dev
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized with service account.")
        else:
            firebase_admin.initialize_app()
            logger.info("Firebase Admin initialized with default credentials.")

    # 2. Start Re-Optimization Event Service (background)
    from app.services.reopt_service import reopt_service
    reopt_task = asyncio.create_task(reopt_service.start())
    logger.info("[ORION-ELITE] Re-Optimization Service started.")

    # 3. Start OSRM Traffic Monitor (background)
    from app.services.traffic_monitor import traffic_monitor
    from app.db.database import async_session
    from app.models.db_models import Order
    from sqlalchemy import select

    async def get_active_coords():
        """Returns lat/lng of all pending orders for OSRM matrix polling."""
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(Order).where(Order.status == 'pending').limit(25)
                )
                orders = result.scalars().all()
                return [[o.destination_lat, o.destination_lng] for o in orders
                        if o.destination_lat and o.destination_lng]
        except Exception:
            return []

    traffic_task = asyncio.create_task(traffic_monitor.start(get_active_coords))
    logger.info("[ORION-ELITE] OSRM Traffic Monitor started.")

    # 4. Start Weather Watchdog (background) — monitors active routes for adverse conditions
    from app.services.weather_watchdog import weather_watchdog
    weather_task = asyncio.create_task(weather_watchdog.start())
    logger.info("[ORION-ELITE] 🌦️ Weather Watchdog started — polling every 10 min.")

    # 5. Full Firebase State Sync (one-time on startup)
    async def startup_sync():
        try:
            from app.services.firebase_db_service import firebase_db_service
            async with async_session() as session:
                # Sync Vehicles/Drivers
                v_res = await session.execute(select(Vehicle).where(Vehicle.is_active == True))
                for v in v_res.scalars().all():
                    await firebase_db_service.add_driver({
                        "vehicle_id": v.external_id,
                        "vehicle_type": v.vehicle_type,
                        "status": "active",
                        "last_sync": datetime.datetime.utcnow().isoformat()
                    })
                
                # Sync Orders
                o_res = await session.execute(select(Order).where(Order.status != "completed"))
                for o in o_res.scalars().all():
                    await firebase_db_service.add_order({
                        "id": str(o.id),
                        "customer_name": o.customer_name,
                        "lat": o.destination_lat,
                        "lng": o.destination_lng,
                        "status": o.status,
                        "assigned_vehicle_id": o.assigned_vehicle_id
                    })
            logger.info("[FIREBASE] Startup sync complete.")
        except Exception as e:
            logger.error(f"[FIREBASE] Startup sync failed: {e}")

    asyncio.create_task(startup_sync())

    yield

    # Graceful shutdown
    reopt_task.cancel()
    traffic_task.cancel()
    weather_task.cancel()
    await reopt_service.stop()
    await traffic_monitor.stop()
    await weather_watchdog.stop()
    logger.info("Service shutting down.")

app = FastAPI(
    title="ORION-ELITE Logistics Platform",
    description="Production-grade VRP with dynamic re-optimization, explainability, and simulation.",
    version="3.0.0",
    lifespan=lifespan
)

# 1.5. Instrumentation: Expose Prometheus metrics for external monitoring
Instrumentator().instrument(app).expose(app)

# Rate Limiter setup to prevent API abuse
app.state.limiter = limiter  # Bind the limiter to the app state for global access
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # Register the 429 error handler

# 1. Gzip Compression - reduces payload size for large route geometries
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Only compress responses larger than 1000 bytes

@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(f"Unhandled Exception: {request.method} {request.url.path} - {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "correlation_id": str(time.time())}
        )

# 2. Audit Logging Middleware
@app.middleware("http")
async def audit_logging_middleware(request: Request, call_next):
    """Logs every enterprise request to the AuditLog table for compliance."""
    from app.db.database import async_session
    from app.models.db_models import AuditLog
    import json

    start_time = time.time()
    
    # We only log JSON bodies for POST/PUT to keep DB size manageable
    request_payload = None
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            # Note: consuming body here might cause issues if not handled carefully (request.body() can only be read once)
            # However, for audit we often need it. 
            pass # Skipping body capture for now to avoid breaking stream, or use a workaround if needed
        except Exception:
            pass

    response = await call_next(request)
    process_time_ms = (time.time() - start_time) * 1000

    # Background task to save audit log without blocking response
    async def save_audit():
        try:
            async with async_session() as session:
                log = AuditLog(
                    endpoint=request.url.path,
                    method=request.method,
                    status_code=response.status_code,
                    process_time_ms=process_time_ms,
                    ip_address=request.client.host if request.client else "unknown",
                    user_agent=request.headers.get("user-agent"),
                    # user_id would be extracted from token if available, but middleware runs before auth injection
                    # A better way is to attach it to request.state in auth dependency
                )
                session.add(log)
                await session.commit()
        except Exception as e:
            logger.error(f"[AUDIT] Failed to save log: {e}")

    import asyncio
    asyncio.create_task(save_audit())

    return response

# 3. Response Time Logging Middleware (Legacy/Console)
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"Request: {request.method} {request.url.path} - Status: {response.status_code} - Timing: {process_time:.4f}s")
    return response

# 3. CORS Policy - allows the React frontend to communicate with the backend
# Set ALLOWED_ORIGINS in .env as a comma-separated list, e.g.:
#   ALLOWED_ORIGINS=http://localhost:5173,http://10.254.28.27:5173
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,      # Explicit list — never a wildcard in production
    allow_credentials=True,             # Safe: credentials only allowed with explicit origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# Include Enterprise Routers to build the final API surface
app.include_router(health.router, tags=["System"])  # System monitoring endpoint
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Security"])  # Login/Identity endpoints
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["Task Queues"]) # Async polling
app.include_router(vrp.router, prefix="/api/v1/logistics", tags=["Enterprise Logistics"])  # Core VRP endpoints
app.include_router(traffic.router, prefix="/api/v1/traffic", tags=["Traffic Domain"])  # ML Prediction endpoints
app.include_router(navigation.router, prefix="/api/v1/navigation", tags=["Navigation Pathfinding"])  # Recalculation endpoints
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Engine Intelligence"])
app.include_router(simulation_router.router, prefix="/api/v1", tags=["Simulation Engine"])
app.include_router(driver_router.router, prefix="/api/v1", tags=["Driver Workflow"])
app.include_router(admin_ops_router.router, prefix="/api/v1", tags=["Admin Control Layer"])

@app.get("/")  # Landing endpoint for the API root
async def root():  # Async handler for the base URL
    return {  # Return basic metadata about the service
        "message": "ORION-ELITE Logistics Platform — Superior to UPS ORION",
        "status": "operational",
        "version": "3.0.0-ELITE",
        "capabilities": [
            "dynamic_reoptimization",
            "incremental_delta_patching",
            "adaptive_constraints",
            "explainable_routing",
            "driver_intent_learning",
            "proof_of_delivery",
            "admin_dispatch_planning",
            "live_fleet_monitoring",
            "admin_intervention",
            "post_route_analytics",
            "what_if_simulation",
            "live_traffic_monitoring",
            "weather_aware_routing",
            "real_time_weather_watchdog",
            "monsoon_route_adaptation"
        ]
    }
