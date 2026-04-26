"""
USES: Defines the logical endpoints for Traffic Prediction and ETA forecasting.
SUPPORT: Handles incoming prediction requests from the frontend and communicates with the TrafficPredictor ML engine.
"""
import httpx
import re
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from ml.predictor import predictor
from app.utils.logger import logger

router = APIRouter()

class TrafficRequest(BaseModel):
    """Schema for a traffic multiplier prediction request."""
    distance_km: float = Field(..., description="Distance in kilometers")
    hour: int = Field(..., ge=0, le=23, description="Hour of the day (0-23)")
    day_of_week: int = Field(..., ge=0, le=6, description="Day of the week (0-6)")
    is_holiday: bool = Field(default=False)
    road_type: int = Field(default=0, description="0 for highway, 1 for city")
    historical_speed: float = Field(default=45.0)

class TrafficResponse(BaseModel):
    """Schema for the traffic prediction response."""
    traffic_multiplier: float
    status: str = "success"

@router.get("/geocode")
async def geocode_backend(address: str = Query(..., description="The place address to locate")):
    """
    Advanced Backend Scraper: Fetches the exact Lat/Long from Google Maps search results.
    Bypasses official API dependency while providing 'Google Map Level' precision.
    """
    logger.info(f"Precise Geocode Request: {address}")
    
    # User agent helps bypass generic bot blocks
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    # URL encoded query
    search_query = address.replace(" ", "+")
    google_search_url = f"https://www.google.com/maps/search/{search_query}"

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # 1. Follow the route to the final result page
            response = await client.get(google_search_url, headers=headers)
            final_url = str(response.url)

            # 2. Strategy A: Check for coordinates embedded in the redirected URL path
            # Pattern: @lat,lng,zoomz
            url_coords = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', final_url)
            if url_coords:
                lat, lng = url_coords.groups()
                logger.debug(f"Coordinates found in URL: {lat}, {lng}")
                return {
                    "lat": float(lat),
                    "lng": float(lng),
                    "address": address,
                    "precision": "high",
                    "source": "google_redirect"
                }

            # 3. Strategy B: Search for coordinates in the hidden JS payload (Window variable)
            # Google often hashes the coordinates in the page body
            js_coords = re.search(r'\[(-?\d+\.\d+),(-?\d+\.\d+)\],null,null,\[null,null,null,"(.*?)"\]', response.text)
            if js_coords:
                lat = js_coords.group(1)
                lng = js_coords.group(2)
                logger.debug(f"Coordinates found in JS payload: {lat}, {lng}")
                return {
                    "lat": float(lat),
                    "lng": float(lng),
                    "address": address,
                    "precision": "high",
                    "source": "google_payload"
                }

            # 4. Strategy C: Regex scan for lat/lng pairs likely to be in Tamil Nadu/India
            # (Look for typical Indian coordinates: Lat 8-38, Lng 68-98)
            all_matches = re.findall(r'(-?\d+\.\d+),(-?\d+\.\d+)', response.text)
            for m_lat, m_lng in all_matches:
                f_lat, f_lng = float(m_lat), float(m_lng)
                if 8 < f_lat < 38 and 68 < f_lng < 98:
                    logger.debug(f"Candidate found in body scan: {f_lat}, {f_lng}")
                    return {
                        "lat": f_lat,
                        "lng": f_lng,
                        "address": address,
                        "precision": "medium-high",
                        "source": "body_scan"
                    }

            # 5. Strategy D: Nominatim (OpenStreetMap) Fallback
            # This is extremely reliable for street-level precision in India/Tamil Nadu
            logger.debug(f"Falling back to Nominatim for: {address}")
            nominatim_url = f"https://nominatim.openstreetmap.org/search?q={search_query}&format=json&limit=1"
            nom_response = await client.get(nominatim_url, headers=headers)
            nom_data = nom_response.json()
            
            if nom_data and len(nom_data) > 0:
                return {
                    "lat": float(nom_data[0]["lat"]),
                    "lng": float(nom_data[0]["lon"]),
                    "address": nom_data[0]["display_name"],
                    "precision": "high",
                    "source": "nominatim_fallback"
                }

            raise HTTPException(status_code=404, detail="Could not extract precise coordinates from any provider.")

    except Exception as e:
        logger.error(f"Backend Geocoder Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch coordinates for: {address}")

@router.post("/predict", response_model=TrafficResponse)
async def predict_traffic(request: TrafficRequest):
    """
    Predict traffic multiplier based on time/context.
    """
    try:
        multiplier = predictor.predict_multiplier(
            hour=request.hour,
            day_of_week=request.day_of_week,
            is_holiday=request.is_holiday
        )
        return {
            "traffic_multiplier": multiplier,
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Traffic Prediction API Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
