"""
USES: High-fidelity route data constructor with ML enhancement.
SUPPORT: Composes final route outputs including street-level GeoJSON, road distances, and ML-predicted traffic-aware durations for driver assignments.
"""
import httpx  # Import HTTP client for calling mapping and traffic services
from datetime import datetime  # Import for handling real-time date/time feature extraction
from app.config import config  # Import configuration for service URL and fuel settings
from app.utils.logger import logger  # Import logging for surfacing integration errors
from ml.predictor import predictor  # Import ML engine for traffic congestion prediction

class RouteBuilder:  # Logic engine for processing raw solver output into actionable data
    def __init__(self):  # Constructor for RouteBuilder
        self.osrm_base = f"{config.OSRM_URL}/route/v1/driving"  # Base URL for the OSRM route service

    async def build_full_route_data(self, stops: list):  # Master method to enrich a sequence of stops
        """
        Integrates OSRM geometry with ML traffic predictions for final output.
        """
        if len(stops) < 2:  # Basic validation: A route needs at least a start and end
            return {}  # Return empty for invalid missions

        # Step 1: Format coordinates for OSRM "route" request
        coord_string = ";".join([f"{s['lng']},{s['lat']}" for s in stops])  # Map stops to "lng,lat" string
        url = f"{self.osrm_base}/{coord_string}?overview=full&geometries=geojson"  # Request full GeoJSON line string

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:  # Open async HTTP session
                response = await client.get(url)  # Fetch the street-level path from OSRM
                if response.status_code != 200:  # Check for mapping server failure
                    return {"geometry": None, "distance_km": 0, "duration_min": 0}  # Safe fallback

                data = response.json()  # Parse the map data
                route_obj = data["routes"][0]  # Extract the primary (fastest) road path
                raw_duration_sec = route_obj["duration"]  # Duration from OSRM (baseline speed)
                distance_meters = route_obj["distance"]  # Total travel distance in meters

                # Step 2: Apply ML Traffic Enhancement
                # We factor in dynamic traffic multipliers to get a realistic arrival time
                now = datetime.now()  # Get current system time
                multiplier = predictor.predict_multiplier(  # Query the ML model
                    hour=now.hour,  # Feature: Current Hour
                    day_of_week=now.weekday()  # Feature: Day of Week (0-6)
                )

                traffic_aware_duration_min = (raw_duration_sec * multiplier) / 60.0  # Apply congestion overhead

                # Step 3: NavCore Instruction Generation (Module 04)
                # Provides specific arrival guidance to reduce cognitive load
                instructions = []
                for i in range(1, len(stops)):
                    leg_dist = route_obj.get('legs', [{}])[i-1].get('distance', 0) / 1000.0
                    cust = stops[i].get('name', 'Client')
                    
                    if i == len(stops) - 1:
                        guidance = f"Final stop at {cust}. End of route sequence."
                    else:
                        guidance = f"Travel {leg_dist:.1f}km to {cust}. Park near entrance."
                    
                    # Add specialized guidance if metadata exists
                    if stops[i].get('priority', 0) > 8:
                        guidance += " [PRIORITY DROP]"
                    
                    instructions.append(guidance)

                return {  # Return the finalized, high-fidelity route data
                    "geometry": route_obj["geometry"],  # GeoJSON path for map overlay
                    "distance_km": round(distance_meters / 1000.0, 2),  # Distance in KM
                    "duration_min": round(traffic_aware_duration_min, 2),  # Traffic-realistic time
                    "navigation_instructions": instructions
                }

        except Exception as e:
            logger.error(f"Route build failure: {e}")  # Catch network or parsing errors
            return {"geometry": None, "distance_km": 0, "duration_min": 0}  # Return safety defaults

route_builder = RouteBuilder()  # Export singleton for use in the solver logic
