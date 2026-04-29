import asyncio
import os
import sys
from firebase_admin import credentials, auth, initialize_app

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.database import async_session
from app.models.db_models import User
from app.core.auth import get_password_hash

# ── Configuration ────────────────────────────────────────────────────────────
CRED_PATH = "routenizz-firebase-adminsdk-fbsvc-99a088ff46.json"
EMAIL = "sreekumar.career@gmail.com"
PASSWORD = "Admin@123"

async def create_admin():
    print(f"🚀 Creating Fresh Admin: {EMAIL}...")
    
    # 1. Create in SQLite
    async with async_session() as session:
        new_admin = User(
            email=EMAIL,
            hashed_password=get_password_hash(PASSWORD),
            role="admin",
            full_name="TNImpact Admin"
        )
        session.add(new_admin)
        try:
            await session.commit()
            print("✅ SQLite Admin Created.")
        except Exception as e:
            print(f"⚠️ SQLite Error (might already exist): {e}")

    # 2. Create in Firebase Auth
    if not os.path.exists(CRED_PATH):
        print(f"❌ Service account not found at {CRED_PATH}")
        return

    try:
        # Check if app already initialized
        initialize_app(credentials.Certificate(CRED_PATH))
    except ValueError:
        pass # Already initialized

    try:
        auth.create_user(
            email=EMAIL,
            password=PASSWORD,
            display_name="TNImpact Admin"
        )
        print("✅ Firebase Auth User Created.")
    except Exception as e:
        print(f"⚠️ Firebase Error (might already exist): {e}")

if __name__ == "__main__":
    asyncio.run(create_admin())
