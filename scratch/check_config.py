import os
from dotenv import load_dotenv
import sys

# Add backend to path
sys.path.append('backend')

# Mock what config.py does
from app.core.config import config

print(f"SECRET_KEY: {config.SECRET_KEY}")
print(f"ALGORITHM: {config.ALGORITHM}")
print(f"DATABASE_URL: {config.DATABASE_URL}")
