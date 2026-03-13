"""
USES: Main entry point and orchestration layer for the FastAPI application. (Integrated 94% Accuracy Model)
SUPPORT: Configures middleware (CORS, Gzip), initializes the rate limiter, and attaches API routers (VRP, Health).
"""
from fastapi import FastAPI, Request  # Import FastAPI for web framework and Request for middleware type hinting
from fastapi.middleware.cors import CORSMiddleware  # Middleware to manage Cross-Origin Resource Sharing (CORS)
from fastapi.middleware.gzip import GZipMiddleware  # Middleware to compress responses for faster network transfer
import time  # Standard library to track execution timing
import os  # For reading ALLOWED_ORIGINS from environment

from app.config import config  # Import system-wide settings like project name and rate limits
from app.utils.logger import logger  # Import structured logging for audit trails and debugging
from app.utils.limiter import limiter  # Import rate limiting logic to protect the API
from slowapi.errors import RateLimitExceeded  # Import exception for status code 429 handling
from slowapi import _rate_limit_exceeded_handler  # Helper to generate standard 429 error responses

# Import modularized routers to keep main.py clean and maintainable
from app.routes import vrp, health, traffic, analytics, navigation  # VRP handles optimization; Health handles monitoring; Traffic handles ML

app = FastAPI(title=config.PROJECT_NAME)  # Initialize FastAPI with the project name from config

# Rate Limiter setup to prevent API abuse
app.state.limiter = limiter  # Bind the limiter to the app state for global access
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # Register the 429 error handler

# 1. Gzip Compression - reduces payload size for large route geometries
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Only compress responses larger than 1000 bytes

# 2. Response Time Logging Middleware - provides telemetry on API performance
@app.middleware("http")  # Intercept all incoming HTTP requests
async def add_process_time_header(request: Request, call_next):  # Define an async middleware function
    start_time = time.time()  # Capture the start time of the request processing
    response = await call_next(request)  # Pass the request to the next handler in the chain
    process_time = time.time() - start_time  # Calculate how long the processing took
    response.headers["X-Process-Time"] = str(process_time)  # Inject processing time into response headers
    logger.info(f"Request: {request.method} {request.url.path} - Processing Time: {process_time:.4f}s")  # Log timing data
    return response  # Return the finalized response to the client

# 3. CORS Policy - allows the React frontend to communicate with the backend
# Set ALLOWED_ORIGINS in .env as a comma-separated list, e.g.:
#   ALLOWED_ORIGINS=http://localhost:5173,http://10.254.28.27:5173
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,      # Explicit list — never a wildcard in production
    allow_credentials=True,             # Safe: credentials only allowed with explicit origins
    allow_methods=["*"],                # Permits all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],                # Permits all custom headers
)

# Include Enterprise Routers to build the final API surface
app.include_router(health.router, tags=["System"])  # System monitoring endpoint
app.include_router(vrp.router, prefix="/api/v1/logistics", tags=["Enterprise Logistics"])  # Core VRP endpoints
app.include_router(traffic.router, prefix="/api/v1/traffic", tags=["Traffic Domain"])  # ML Prediction endpoints
app.include_router(navigation.router, prefix="/api/v1/navigation", tags=["Navigation Pathfinding"])  # Recalculation endpoints
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Engine Intelligence"])  # Real-time Analytics endpoints

@app.get("/")  # Landing endpoint for the API root
async def root():  # Async handler for the base URL
    return {  # Return basic metadata about the service
        "message": "TNImpact Enterprise Routing Engine",
        "status": "operational",
        "version": "2.0.0"
    }
