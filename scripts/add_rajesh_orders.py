
import asyncio
import os
import sys
from datetime import datetime

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.database import async_session, engine, Base
from app.models.db_models import Order, Vehicle, User
from app.services.firebase_db_service import firebase_db_service

async def add_rajesh_data():
    print("🚀 Initializing data for Rajesh Kumar...")
    
    # 1. Check if Rajesh Kumar exists, if not create him
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.full_name == "Rajesh Kumar"))
        rajesh = result.scalar_one_or_none()
        
        vehicle_id = "V-RAJ-01"
        
        if not rajesh:
            print("👤 Creating driver: Rajesh Kumar")
            # Create Vehicle
            new_vehicle = Vehicle(
                external_id=vehicle_id,
                vehicle_type="Van",
                capacity=50,
                weight_capacity_kg=1000,
                volume_capacity_m3=10,
                is_active=True
            )
            session.add(new_vehicle)
            
            # Create User
            rajesh = User(
                email="rajesh.kumar@routenizz.com",
                full_name="Rajesh Kumar",
                role="driver",
                pin="123456",
                vehicle_id=vehicle_id,
                employee_number="EMP-RAJ-001"
            )
            session.add(rajesh)
            await session.commit()
            print(f"✅ Created Rajesh Kumar with vehicle {vehicle_id}")
            
            # Sync to Firebase
            await firebase_db_service.add_driver({
                "vehicle_id": vehicle_id,
                "name": "Rajesh Kumar",
                "full_name": "Rajesh Kumar",
                "email": "rajesh.kumar@routenizz.com",
                "role": "driver",
                "status": "active",
                "last_sync": datetime.utcnow().isoformat()
            })
        else:
            vehicle_id = rajesh.vehicle_id
            print(f"👤 Rajesh Kumar already exists with vehicle {vehicle_id}")

    # 2. Add the 3 orders
    orders_to_add = [
        {"name": "Saveetha", "lat": 13.0267043, "lng": 80.0135828},
        {"name": "Queens Land", "lat": 13.0251715, "lng": 80.0120095},
        {"name": "Sree Meditec", "lat": 12.9220843, "lng": 80.135336}
    ]
    
    print(f"📦 Adding {len(orders_to_add)} orders assigned to {vehicle_id}...")
    
    async with async_session() as session:
        for i, o_data in enumerate(orders_to_add):
            order = Order(
                customer_name=o_data["name"],
                destination_lat=o_data["lat"],
                destination_lng=o_data["lng"],
                status="assigned",
                priority=10,
                assigned_vehicle_id=vehicle_id,
                sequence_order=i + 1
            )
            session.add(order)
            await session.flush() # Get the ID
            
            # Sync to Firebase
            await firebase_db_service.add_order({
                "id": str(order.id),
                "customer_name": o_data["name"],
                "lat": o_data["lat"],
                "lng": o_data["lng"],
                "status": "assigned",
                "assigned_vehicle_id": vehicle_id,
                "priority": 10,
                "sequence_order": i + 1,
                "created_at": datetime.utcnow().isoformat()
            })
            print(f"  + Added {o_data['name']}")
        
        await session.commit()
    
    print("✅ All data populated and synced to Firebase!")

if __name__ == "__main__":
    asyncio.run(add_rajesh_data())
