"""
ORION-ELITE: Seed Drivers script.
Creates dummy drivers and associates them with vehicles.
Run: PYTHONPATH=backend python scripts/seed_drivers.py
"""
import asyncio
import random
import datetime
import os
import sys

# Ensure backend directory is in sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.database import async_session, engine
from app.models.db_models import User, Vehicle
from sqlalchemy import select, delete

DRIVERS = [
    {"full_name": "Rajesh Kumar", "email": "rajesh@tnimpact.com", "phone": "9876543210", "vehicle_id": "V-001"},
    {"full_name": "Amit Singh", "email": "amit@tnimpact.com", "phone": "9876543211", "vehicle_id": "V-002"},
    {"full_name": "Suresh Raina", "email": "suresh@tnimpact.com", "phone": "9876543212", "vehicle_id": "V-003"},
    {"full_name": "Vijay Shankar", "email": "vijay@tnimpact.com", "phone": "9876543213", "vehicle_id": "V-004"},
    {"full_name": "Anitha Raj", "email": "anitha@tnimpact.com", "phone": "9876543214", "vehicle_id": "V-005"},
]

async def seed_drivers():
    print("🌱 Seeding Dummy Drivers...")
    
    # Initialize Firebase if available
    try:
        from app.services.firebase_db_service import firebase_db_service
        firebase_available = True
    except Exception as e:
        print(f"⚠️  Firebase service not available: {e}")
        firebase_available = False

    async with async_session() as session:
        # Clear existing drivers to avoid duplicates if re-run
        # Only clear role='driver'
        print("🗑  Cleaning up existing driver records in SQL...")
        await session.execute(delete(User).where(User.role == "driver"))
        await session.commit()

        if firebase_available:
            print("🗑  Cleaning up seeded drivers in Firestore...")
            try:
                for d_data in DRIVERS:
                    # Attempt to delete the document if it exists
                    doc_ref = firebase_db_service.db.collection("drivers").document(d_data["vehicle_id"])
                    doc_ref.delete()
            except Exception as e:
                print(f"⚠️  Firestore cleanup warning: {e}")

        for d_data in DRIVERS:
            # Generate unique 6-digit PIN
            pin = "".join([str(random.randint(0, 9)) for _ in range(6)])
            
            # Auto-generate Employee Number
            date_str = datetime.datetime.now().strftime("%y%m%d")
            rand_suffix = "".join([str(random.randint(0, 9)) for _ in range(4)])
            emp_num = f"EMP-{date_str}-{rand_suffix}"

            # Check if vehicle exists
            result = await session.execute(select(Vehicle).where(Vehicle.external_id == d_data["vehicle_id"]))
            vehicle = result.scalar_one_or_none()
            
            if not vehicle:
                print(f"⚠️  Vehicle {d_data['vehicle_id']} not found in SQL DB. Skipping driver {d_data['full_name']}")
                continue

            new_driver = User(
                email=d_data["email"],
                full_name=d_data["full_name"],
                employee_number=emp_num,
                phone=d_data["phone"],
                role="driver",
                pin=pin,
                vehicle_id=d_data["vehicle_id"],
                is_active=True
            )
            session.add(new_driver)
            print(f"✅ Created Driver: {d_data['full_name']} (PIN: {pin}, Vehicle: {d_data['vehicle_id']})")

            # Create avatar (initials)
            avatar = "".join([n[0] for n in d_data["full_name"].split()]).upper()
            
            # Format vehicle string for UI (e.g. "VAN (V-001)")
            vehicle_str = f"{vehicle.vehicle_type.upper()} ({d_data['vehicle_id']})"

            # Sync to Firebase
            if firebase_available:
                try:
                    await firebase_db_service.add_driver({
                        "id": d_data["vehicle_id"],
                        "avatar": avatar,
                        "name": d_data["full_name"],
                        "full_name": d_data["full_name"],
                        "email": d_data["email"],
                        "employee_number": emp_num,
                        "phone": d_data["phone"],
                        "role": "driver",
                        "pin": pin,
                        "vehicle_id": d_data["vehicle_id"],
                        "vehicle_type": vehicle.vehicle_type,
                        "vehicle": vehicle_str,
                        "capacity": vehicle.capacity,
                        "status": "Idle",
                        "rating": 5.0,
                        "completedToday": 0,
                        "last_active": datetime.datetime.utcnow().isoformat()
                    })
                    print(f"   🔥 Synced {d_data['email']} to Firestore (ID: {d_data['vehicle_id']})")
                except Exception as f_err:
                    print(f"   ⚠️  Firebase sync failed for {d_data['email']}: {f_err}")

        await session.commit()

    print("\n🏁 Driver Seeding Complete!")
    print("   Note: These drivers use PIN authentication in the mobile app.")

if __name__ == "__main__":
    asyncio.run(seed_drivers())
