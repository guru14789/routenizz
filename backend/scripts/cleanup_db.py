import asyncio
import os
import sys

# Ensure backend is in path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.database import async_session, engine, Base
from app.models.db_models import User, Vehicle, Order
from sqlalchemy import delete

async def cleanup_db():
    print("🧹 Cleaning up Database (Non-Admins)...")
    
    async with async_session() as session:
        # 1. Delete all users who are NOT admin
        await session.execute(delete(User).where(User.role != "admin"))
        
        # 2. Delete all vehicles
        await session.execute(delete(Vehicle))
        
        # 3. Optional: Reset orders to pending
        from sqlalchemy import update
        await session.execute(update(Order).values(status="pending", assigned_vehicle_id=None, sequence_order=0))
        
        await session.commit()
        print("✅ Cleanup Complete! Drivers and Vehicles cleared.")
        print("🚀 You can now retry the 'Add Driver' operation in the dashboard.")

if __name__ == "__main__":
    asyncio.run(cleanup_db())
