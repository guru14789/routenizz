"""
USES: Centralized Environment Configuration management.
SUPPORT: Loads operational parameters from .env files and provides a structured interface for accessing API keys, paths, and server settings.
"""
import os  # Standard library for environment variable access and file path manipulation
from dotenv import load_dotenv  # Utility to parse .env files and load them into the OS environment

load_dotenv()  # Initialize the process by reading the local .env file

class Config:  # Object-oriented wrapper for application settings
    # 1. Project Identity
    PROJECT_NAME: str = "TNImpact - Enterprise AI Router"  # Public name used in logs and API docs
    
    # 2. Application Logic Parameters
    MODEL_PATH: str = os.getenv("MODEL_PATH", "ml_models/traffic_predictor.joblib")  # Path to the predictive ML model
    FUEL_PRICE: float = float(os.getenv("FUEL_PRICE", 95.0))  # Regional baseline fuel price in INR
    
    # 3. Third-Party Infrastructure URLs
    OSRM_URL: str = os.getenv("OSRM_URL", "https://router.project-osrm.org")
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
    WEATHER_IMPACT_MULTIPLIER: float = float(os.getenv("WEATHER_IMPACT_MULTIPLIER", "1.0"))  # Default: 1.0 (Clear)

config = Config()  # Export a singleton instance to be used by all backend components
