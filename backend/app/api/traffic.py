"""
USES: Defines the logical endpoints for Traffic Prediction and ETA forecasting.
SUPPORT: Handles incoming prediction requests from the frontend and communicates with the TrafficPredictor ML engine.
"""
import httpx
import re
import asyncio
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from app.ml.predictor import predictor
from app.core.logger import logger

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
    
    # Clean the address: remove common Indian prefix noise that confuses geocoders
    address = re.sub(r'^(door\s*no|flat\s*no|no|#)[:.\s]*', '', address, flags=re.IGNORECASE)
    
    # User agent helps bypass generic bot blocks - specific and identifiable
    headers = {
        "User-Agent": "TNImpact-Logistics-Platform/1.0 (contact: admin@tnimpact.com)",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    # URL encoded query
    search_query = address.replace(" ", "+")
    google_search_url = f"https://www.google.com/maps/search/{search_query}"

    # 1. Strategy A: Nominatim (OpenStreetMap) with Recursive Reduction
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # We try the full address, then progressively strip parts from the left (house numbers etc)
            address_parts = [p.strip() for p in address.split(',')]
            
            for i in range(len(address_parts)):
                # Join parts from current index to end
                sub_query = ", ".join(address_parts[i:])
                if len(sub_query) < 8: break # Too short to be useful
                
                logger.debug(f"Nominatim Attempt {i+1}: {sub_query}")
                encoded_sub = sub_query.replace(" ", "+")
                nominatim_url = f"https://nominatim.openstreetmap.org/search?q={encoded_sub}&format=json&limit=1"
                
                nom_response = await client.get(nominatim_url, headers=headers)
                if nom_response.status_code == 200:
                    nom_data = nom_response.json()
                    if nom_data and len(nom_data) > 0:
                        logger.info(f"Nominatim Success (Level {i}): {nom_data[0]['lat']}, {nom_data[0]['lon']}")
                        return {
                            "lat": float(nom_data[0]["lat"]),
                            "lng": float(nom_data[0]["lon"]),
                            "address": nom_data[0]["display_name"],
                            "precision": "high" if i == 0 else "medium",
                            "source": f"nominatim_level_{i}"
                        }
                await asyncio.sleep(0.1) # Tiny pause between retries

            # 2. Strategy B: Google Maps Redirection (Fallback)
            logger.debug(f"Falling back to Google Maps Scraping for: {address}")
            response = await client.get(google_search_url, headers=headers)
            final_url = str(response.url)

            # Check for coordinates embedded in the redirected URL path
            url_coords = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', final_url)
            if url_coords:
                lat, lng = url_coords.groups()
                return {
                    "lat": float(lat),
                    "lng": float(lng),
                    "address": address,
                    "precision": "high",
                    "source": "google_redirect"
                }

            # Strategy C: Search for coordinates in the hidden JS payload
            js_coords = re.search(r'\[(-?\d+\.\d+),(-?\d+\.\d+)\],null,null,\[null,null,null,"(.*?)"\]', response.text)
            if js_coords:
                return {
                    "lat": float(js_coords.group(1)),
                    "lng": float(js_coords.group(2)),
                    "address": address,
                    "precision": "high",
                    "source": "google_payload"
                }

            # Strategy D: Regex scan for lat/lng pairs likely to be in Tamil Nadu/India
            all_matches = re.findall(r'(-?\d+\.\d+),(-?\d+\.\d+)', response.text)
            for m_lat, m_lng in all_matches:
                f_lat, f_lng = float(m_lat), float(m_lng)
                if 8 < f_lat < 38 and 68 < f_lng < 98:
                    return {
                        "lat": f_lat,
                        "lng": f_lng,
                        "address": address,
                        "precision": "medium-high",
                        "source": "body_scan"
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
