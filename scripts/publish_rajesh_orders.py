
import asyncio
import os
import sys

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.firebase_db_service import firebase_db_service

async def publish_rajesh_orders():
    print("📡 Publishing Rajesh's orders to Firebase...")
    
    # In a real app we'd fetch the order IDs from the DB, but here I can just use the IDs I know or update by query if the service supported it.
    # Since my add_order service uses document(order_id), I'll just update the specific orders I added.
    # Based on the previous script, the IDs were generated as order.id from the DB.
    # Let's just update all orders that have assigned_vehicle_id: V-RAJ-01
    
    db = firebase_db_service.db
    if not db:
        print("❌ Firestore not initialized")
        return

    orders_ref = db.collection("orders")
    docs = orders_ref.where("assigned_vehicle_id", "==", "V-RAJ-01").stream()
    
    count = 0
    for doc in docs:
        doc.reference.update({"status": "published"})
        print(f"  + Published order: {doc.id}")
        count += 1
    
    # Also update the driver's status to published
    driver_ref = db.collection("drivers").document("V-RAJ-01")
    driver_ref.update({"status": "published"})
    print(f"✅ Driver V-RAJ-01 status set to published")

    print(f"✅ Successfully published {count} orders to Firebase.")

if __name__ == "__main__":
    asyncio.run(publish_rajesh_orders())
