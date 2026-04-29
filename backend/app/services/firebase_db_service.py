import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.db.firebase import get_firestore_db

logger = logging.getLogger("app.services.firebase_db_service")

class FirebaseDBService:
    def __init__(self):
        self.db = get_firestore_db()

    async def add_order(self, order_data: Dict[str, Any]) -> Optional[str]:
        """Adds a new order to the 'orders' collection."""
        if not self.db:
            logger.warning("Skipping add_order to Firebase (Firestore not initialized)")
            return None
        try:
            # Ensure timestamp is set
            if "created_at" not in order_data:
                order_data["created_at"] = datetime.utcnow()
            
            doc_ref = self.db.collection("orders").document()
            doc_ref.set(order_data)
            logger.info(f"Order added to Firestore: {doc_ref.id}")
            return doc_ref.id
        except Exception as e:
            logger.error(f"Error adding order to Firestore: {e}")
            return None

    async def add_driver(self, driver_data: Dict[str, Any]) -> Optional[str]:
        """Adds a new driver/vehicle to the 'drivers' collection."""
        if not self.db:
            logger.warning("Skipping add_driver to Firebase (Firestore not initialized)")
            return None
        try:
            # Use vehicle_id as the document ID for easy lookup
            vehicle_id = driver_data.get("vehicle_id")
            if not vehicle_id:
                raise ValueError("vehicle_id is required for adding a driver")
            
            doc_ref = self.db.collection("drivers").document(vehicle_id)
            doc_ref.set(driver_data)
            logger.info(f"Driver/Vehicle added to Firestore: {vehicle_id}")
            return vehicle_id
        except Exception as e:
            logger.error(f"Error adding driver to Firestore: {e}")
            return None

    async def update_order_status(self, order_id: str, status: str, extra_data: Optional[Dict[str, Any]] = None):
        """Updates an order's status in Firestore."""
        if not self.db:
            return
        try:
            doc_ref = self.db.collection("orders").document(str(order_id))
            update_data = {"status": status, "updated_at": datetime.utcnow()}
            if extra_data:
                update_data.update(extra_data)
            doc_ref.update(update_data)
        except Exception as e:
            logger.error(f"Error updating order {order_id} in Firestore: {e}")

    async def sync_route_to_firebase(self, vehicle_id: str, stops: List[Dict[str, Any]]):
        """Syncs the optimized route for a vehicle to Firestore."""
        if not self.db:
            return
        try:
            # Update the vehicle's document in 'drivers' with the new route
            doc_ref = self.db.collection("drivers").document(vehicle_id)
            doc_ref.update({
                "current_route": stops,
                "route_updated_at": datetime.utcnow(),
                "status": "ready"
            })
            
            # Also update individual orders in 'orders' collection
            for stop in stops:
                order_id = stop.get("id")
                if order_id and not str(order_id).startswith(("HQ", "DEPOT")):
                    await self.update_order_status(str(order_id), "assigned", {
                        "assigned_vehicle_id": vehicle_id,
                        "sequence_order": stop.get("sequence")
                    })
        except Exception as e:
            logger.error(f"Error syncing route to Firestore for vehicle {vehicle_id}: {e}")

    async def update_telemetry(self, vehicle_id: str, lat: float, lng: float, extra: Optional[Dict[str, Any]] = None):
        """Updates live GPS coordinates in Firestore for real-time tracking."""
        if not self.db:
            return
        try:
            doc_ref = self.db.collection("drivers").document(vehicle_id)
            update_data = {
                "location": {"lat": lat, "lng": lng},
                "last_ping": datetime.utcnow()
            }
            if extra:
                update_data.update(extra)
            doc_ref.update(update_data)
        except Exception as e:
            logger.error(f"Error updating telemetry for {vehicle_id}: {e}")

    async def log_driver_event(self, vehicle_id: str, event_type: str, message: str, metadata: Optional[Dict[str, Any]] = None):
        """Logs a driver-initiated event (delay, exception, pod) to the global event stream."""
        if not self.db:
            return
        try:
            event_ref = self.db.collection("events").document()
            event_ref.set({
                "vehicle_id": vehicle_id,
                "type": event_type,
                "message": message,
                "metadata": metadata or {},
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Error logging driver event: {e}")

firebase_db_service = FirebaseDBService()
