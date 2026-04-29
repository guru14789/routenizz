
import asyncio
import os
import sys
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'backend')))

from app.models.db_models import User, Vehicle
from app.services.firebase_db_service import firebase_db_service
from app.core.config import config
from app.db.database import async_session

async def sync_all_to_firebase():
    print("Connecting to SQLite...")
    
    async with async_session() as db:
        # Get all drivers
        result = await db.execute(select(User).where(User.role == "driver"))
        drivers = result.scalars().all()
        
        print(f"Found {len(drivers)} drivers in SQLite. Syncing to Firestore...")
        
        for driver in drivers:
            # Get vehicle info
            v_result = await db.execute(select(Vehicle).where(Vehicle.id == driver.vehicle_id))
            vehicle = v_result.scalar_one_or_none()
            
            driver_data = {
                "email": driver.email,
                "full_name": driver.full_name,
                "employee_number": driver.employee_number,
                "phone": driver.phone,
                "role": "driver",
                "pin": driver.pin,
                "vehicle_id": driver.vehicle_id,
                "vehicle_type": vehicle.vehicle_type if vehicle else "N/A",
                "capacity": vehicle.capacity if vehicle else 0,
                "status": "active",
                "last_active": driver.updated_at.isoformat() if driver.updated_at else None
            }
            
            print(f"Syncing {driver.email}...")
            await firebase_db_service.add_driver(driver_data)
            
    print("Sync complete.")

if __name__ == "__main__":
    asyncio.run(sync_all_to_firebase())
