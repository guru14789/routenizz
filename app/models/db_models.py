from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.utils.database import Base
import datetime

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String)
    destination_lat = Column(Float)
    destination_lng = Column(Float)
    status = Column(String, default="pending")  # pending, assigned, completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True) 
    vehicle_type = Column(String)
    capacity = Column(Integer)
    is_active = Column(Boolean, default=True)

class TripHistory(Base):
    """
    Industrial Audit Table: Stores the results of every VRP optimization.
    """
    __tablename__ = "trip_history"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    total_distance_km = Column(Float)
    total_duration_min = Column(Float)
    total_cost = Column(Float)
    total_fuel_litres = Column(Float)
    vehicles_count = Column(Integer)
    stops_count = Column(Integer)
    raw_results = Column(JSON) # Full sequence of stops for playback
    optimization_score = Column(Float)

class TelemetryLog(Base):
    """
    ORION Feedback Loop: Tracks Actual vs. Predicted performance per segment.
    Used for ML model retraining and driver performance analytics.
    """
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String, index=True)
    segment_id = Column(String)  # Stop ID or segment identifier
    predicted_duration_sec = Column(Float)
    actual_duration_sec = Column(Float)
    predicted_distance_km = Column(Float)
    actual_distance_km = Column(Float)
    traffic_multiplier_at_time = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    efficiency_gap = Column(Float)  # (Actual - Predicted) / Predicted
