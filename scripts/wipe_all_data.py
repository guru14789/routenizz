import asyncio
import os
import sys
from sqlalchemy import delete
from firebase_admin import credentials, auth, firestore, initialize_app

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.database import engine, Base, async_session
from app.models.db_models import (
    User, Order, Vehicle, TripHistory, TelemetryLog,
    DriverIntentLog, ConstraintProfile, SimulationLog,
    ReOptEvent, RouteSegment, EVChargingStation
)

# ── Firebase Configuration ───────────────────────────────────────────────────
CRED_PATH = "routenizz-firebase-adminsdk-fbsvc-99a088ff46.json"

async def wipe_sqlite():
    print("🗑  Wiping SQLite Database...")
    async with async_session() as session:
        # Tables to clear in order (handling dependencies if any)
        tables = [
            RouteSegment, ReOptEvent, SimulationLog, ConstraintProfile,
            DriverIntentLog, TelemetryLog, TripHistory, Order, 
            User, Vehicle, EVChargingStation
        ]
        
        for table in tables:
            print(f"   Clearing {table.__tablename__}...")
            await session.execute(delete(table))
        
        await session.commit()
    print("✅ SQLite Wiped.")

def wipe_firebase():
    print("🔥 Wiping Firebase Data...")
    if not os.path.exists(CRED_PATH):
        print(f"❌ Service account not found at {CRED_PATH}")
        return

    cred = credentials.Certificate(CRED_PATH)
    initialize_app(cred)
    db = firestore.client()

    # 1. Wipe Firestore Collections
    collections = ['users', 'orders', 'drivers']
    for coll_name in collections:
        print(f"   Clearing Firestore collection: {coll_name}...")
        docs = db.collection(coll_name).stream()
        count = 0
        for doc in docs:
            doc.reference.delete()
            count += 1
        print(f"   Deleted {count} documents from {coll_name}.")

    # 2. Wipe Firebase Auth Users
    print("   Clearing Firebase Auth Users...")
    users = auth.list_users().iterate_all()
    count = 0
    for user in users:
        auth.delete_user(user.uid)
        count += 1
    print(f"   Deleted {count} users from Firebase Auth.")
    print("✅ Firebase Wiped.")

async def main():
    try:
        await wipe_sqlite()
        wipe_firebase()
        print("\n✨ ALL DATA AND AUTH DETAILS HAVE BEEN DELETED.")
    except Exception as e:
        print(f"❌ Error during wipe: {e}")

if __name__ == "__main__":
    asyncio.run(main())
