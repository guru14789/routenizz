"""
USES: Centralized Environment Configuration management.
SUPPORT: Loads operational parameters from .env files and provides a structured interface for accessing API keys, paths, and server settings.
"""
import os
from dotenv import load_dotenv

# Search for .env in current and parent directories
load_dotenv(os.path.join(os.path.dirname(__file__), '../../../.env'))
load_dotenv()  # Fallback to local


class Config:
    # 1. Project Identity
    PROJECT_NAME: str = "TNImpact - Enterprise AI Router"

    # 2. Application Logic Parameters
    MODEL_PATH: str = os.getenv("MODEL_PATH", "ml_models/traffic_predictor.joblib")
    FUEL_PRICE: float = float(os.getenv("FUEL_PRICE", 95.0))

    # 3. Third-Party Infrastructure URLs
    OSRM_URL: str = os.getenv("OSRM_URL", "https://router.project-osrm.org").strip()
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tn_logistics.db")

    # 4. Security & Authentication
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-super-secret-key-goes-here")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    # 5. Observability & Telemetry Settings
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "app.log")

    # 6. Global Rate Limits
    RATE_LIMIT: str = "100 per minute"

    # 7. Orion Advanced Parameters
    WEATHER_IMPACT_MULTIPLIER: float = float(os.getenv("WEATHER_IMPACT_MULTIPLIER", "1.0"))

    # 8. ORION-ELITE: Centralized tuning parameters (previously hardcoded in individual modules)
    WEATHER_POLL_INTERVAL_SEC: int = int(os.getenv("WEATHER_POLL_INTERVAL_SEC", "600"))   # 10 min
    WEATHER_COOLDOWN_MIN: int = int(os.getenv("WEATHER_COOLDOWN_MIN", "15"))
    ALNS_TIME_LIMIT_SEC: float = float(os.getenv("ALNS_TIME_LIMIT_SEC", "2.5"))
    PIPELINE_TIME_BUDGET_SEC: float = float(os.getenv("PIPELINE_TIME_BUDGET_SEC", "3.0"))

    # 9. OSRM Circuit-Breaker tuning
    OSRM_CIRCUIT_FAILURE_THRESHOLD: int = int(os.getenv("OSRM_CIRCUIT_FAILURE_THRESHOLD", "5"))
    OSRM_CIRCUIT_TIMEOUT_SEC: float = float(os.getenv("OSRM_CIRCUIT_TIMEOUT_SEC", "30.0"))


config = Config()

