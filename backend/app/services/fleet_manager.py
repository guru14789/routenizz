from app.core.logger import logger

class FleetManager:
    def __init__(self):
        self.active_fleet = {}

    def register_vehicle(self, vehicle_id: str, metadata: dict):
        self.active_fleet[vehicle_id] = metadata
        logger.info(f"FleetMgr: Registered vehicle {vehicle_id}")

    def get_fleet_status(self):
        return self.active_fleet

fleet_manager = FleetManager()
