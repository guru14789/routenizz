from app.core.config import config
import os

print(f"Current Directory: {os.getcwd()}")
print(f"SECRET_KEY: {config.SECRET_KEY[:5]}...")
print(f"DATABASE_URL: {config.DATABASE_URL}")
print(f"ALGORITHM: {config.ALGORITHM}")
