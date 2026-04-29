"""
ORION-ELITE: Extended Database Models
PHASE 4 — Full PostgreSQL schema with migrations support.
New tables: driver_intent, constraint_profiles, simulation_log, route_segments, reopt_events
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, JSON, Text, Index
)
from sqlalchemy.orm import relationship
from app.db.database import Base
import datetime


# ── EXISTING TABLES (preserved) ───────────────────────────────────────────────

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String)
    destination_lat = Column(Float)
    destination_lng = Column(Float)
    status = Column(String, default="pending")  # pending, assigned, in_transit, completed, failed
    priority = Column(Integer, default=5)
    stop_type = Column(String, default="Residential")  # Business | Residential
    demand_units = Column(Float, default=1.0)
    weight_kg = Column(Float, default=0.0)
    volume_m3 = Column(Float, default=0.0)
    time_window_start = Column(Integer, default=0)
    time_window_end = Column(Integer, default=86400)
    assigned_vehicle_id = Column(String, nullable=True)
    sequence_order = Column(Integer, nullable=True, default=0)           # Position in optimized route
    actual_completion_time = Column(String, nullable=True)               # ISO timestamp when marked
    proof_of_delivery = Column(String, nullable=True)                    # JSON: {type, data, notes, lat, lng}
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True)
    vehicle_type = Column(String)
    capacity = Column(Integer)  # Generic units
    weight_capacity_kg = Column(Float, default=1000.0)
    volume_capacity_m3 = Column(Float, default=10.0)
    is_active = Column(Boolean, default=True)
    is_electric = Column(Boolean, default=False)
    consumption_liters_per_100km = Column(Float, default=12.0)
    fuel_price_per_litre = Column(Float, default=95.0)
    cost_per_km = Column(Float, default=1.5)
    driver_hourly_wage = Column(Float, default=250.0)
    shift_start = Column(Integer, default=28800)   # 08:00 in seconds
    shift_end = Column(Integer, default=64800)     # 18:00 in seconds
    assigned_zone = Column(Integer, nullable=True)


class TripHistory(Base):
    """Industrial Audit Table: Every optimization is logged."""
    __tablename__ = "trip_history"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    total_distance_km = Column(Float)
    total_duration_min = Column(Float)
    total_cost = Column(Float)
    total_fuel_litres = Column(Float)
    total_co2_kg = Column(Float, default=0.0)
    co2_saved_kg = Column(Float, default=0.0)
    vehicles_count = Column(Integer)
    stops_count = Column(Integer)
    raw_results = Column(JSON)
    optimization_score = Column(Float)
    trigger = Column(String, default="manual")           # manual | traffic | new_order | delta
    explainability_report = Column(JSON, nullable=True)  # Full explanation for auditability


class TelemetryLog(Base):
    """ORION Feedback Loop: Actual vs Predicted per segment for ML retraining."""
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String, index=True)
    segment_id = Column(String)
    predicted_duration_sec = Column(Float)
    actual_duration_sec = Column(Float)
    predicted_distance_km = Column(Float)
    actual_distance_km = Column(Float)
    traffic_multiplier_at_time = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    efficiency_gap = Column(Float)  # (Actual - Predicted) / Predicted


# ── NEW ORION-ELITE TABLES ─────────────────────────────────────────────────────

class DriverIntentLog(Base):
    """
    ORION-ELITE: Driver Intent Learning.
    Records every segment that a driver manually overrides, enabling the AI
    to learn local road conditions and preferences over time.
    """
    __tablename__ = "driver_intent_log"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String, index=True)
    driver_id = Column(String, index=True, nullable=True)
    from_node = Column(String)           # Source stop/node identifier
    to_node = Column(String)             # Destination stop/node identifier
    from_lat = Column(Float, nullable=True)
    from_lng = Column(Float, nullable=True)
    to_lat = Column(Float, nullable=True)
    to_lng = Column(Float, nullable=True)
    avoidance_reason = Column(String, nullable=True)  # traffic | construction | preference | unknown
    avoidance_count = Column(Integer, default=1)      # How many times this segment was avoided
    preference_score = Column(Float, default=2.5)     # Cost multiplier applied in future solves
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_driver_intent_vehicle_segment", "vehicle_id", "from_node", "to_node"),
    )


class ConstraintProfile(Base):
    """
    ORION-ELITE: Adaptive Constraint Profiles per vehicle/customer.
    Allows per-vehicle or per-customer constraint tuning without code changes.
    """
    __tablename__ = "constraint_profiles"

    id = Column(Integer, primary_key=True, index=True)
    profile_name = Column(String, unique=True, index=True)
    profile_type = Column(String)        # "vehicle" | "customer" | "global"
    entity_id = Column(String, nullable=True)  # vehicle_id or customer_id
    constraints = Column(JSON)           # {constraint_name: {penalty, active, notes}}
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class SimulationLog(Base):
    """
    ORION-ELITE: Stores every what-if simulation for dispatcher review.
    Allows historical comparison of scenarios.
    """
    __tablename__ = "simulation_log"

    id = Column(Integer, primary_key=True, index=True)
    scenario_type = Column(String)       # demand_spike | vehicle_breakdown | traffic | emergency
    scenario_name = Column(String)
    baseline_cost = Column(Float)
    simulated_cost = Column(Float)
    cost_delta = Column(Float)
    baseline_duration_min = Column(Float)
    simulated_duration_min = Column(Float)
    duration_delta_min = Column(Float)
    baseline_co2_kg = Column(Float)
    simulated_co2_kg = Column(Float)
    routes_affected = Column(Integer)
    recommendation = Column(Text)
    full_result = Column(JSON)           # Complete SimulationResult for audit replay
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_by = Column(String, nullable=True)   # Admin user ID


class ReOptEvent(Base):
    """
    ORION-ELITE: Audit log for every re-optimization event.
    Enables post-hoc analysis of how the system responded to live conditions.
    """
    __tablename__ = "reopt_events"

    id = Column(Integer, primary_key=True, index=True)
    trigger = Column(String)             # traffic | new_order | driver_delay | manual
    trigger_data = Column(JSON)          # Raw event payload that caused the re-opt
    affected_vehicle_ids = Column(JSON)  # List of vehicle IDs that were rerouted
    stops_rerouted = Column(Integer, default=0)
    cost_before = Column(Float, nullable=True)
    cost_after = Column(Float, nullable=True)
    cost_delta = Column(Float, nullable=True)
    time_saved_min = Column(Float, nullable=True)
    solver_time_ms = Column(Float, nullable=True)
    status = Column(String, default="success")  # success | failed | skipped
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_reopt_events_trigger_time", "trigger", "timestamp"),
    )


class RouteSegment(Base):
    """
    ORION-ELITE: Stores per-segment route data for granular analytics.
    Enables heatmapping of slow segments and driver performance tracking.
    """
    __tablename__ = "route_segments"

    id = Column(Integer, primary_key=True, index=True)
    trip_history_id = Column(Integer, ForeignKey("trip_history.id"), nullable=True)
    vehicle_id = Column(String, index=True)
    from_stop_id = Column(String)
    to_stop_id = Column(String)
    from_lat = Column(Float)
    from_lng = Column(Float)
    to_lat = Column(Float)
    to_lng = Column(Float)
    planned_duration_sec = Column(Float)
    planned_distance_km = Column(Float)
    actual_duration_sec = Column(Float, nullable=True)
    actual_distance_km = Column(Float, nullable=True)
    turn_type = Column(String, nullable=True)        # left | right | straight | u-turn
    turn_penalty_applied = Column(Float, default=1.0)
    zone_penalty_applied = Column(Float, default=1.0)
    sequence_position = Column(Integer)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    trip = relationship("TripHistory", backref="segments", foreign_keys=[trip_history_id])

class EVChargingStation(Base):
    """
    ORION-ELITE: Sustainability Module.
    Stores EV charging station locations for distance-aware battery management.
    """
    __tablename__ = "ev_charging_stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    charger_type = Column(String)  # Slow | Fast | Supercharger
    provider = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class User(Base):
    """
    ORION-ELITE: Unified User Model for Admin and Driver Auth.
    - Admins use email + password.
    - Drivers use email + PIN (generated by Admin).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)  # Used by Admins
    pin = Column(String, nullable=True)             # Used by Drivers
    role = Column(String)                           # "admin" | "driver"
    full_name = Column(String, nullable=True)
    employee_number = Column(String, unique=True, nullable=True)
    phone = Column(String, nullable=True)
    document_urls = Column(JSON, nullable=True)      # List of URLs or metadata
    is_active = Column(Boolean, default=True)
    
    # Driver-specific: Map to a vehicle
    vehicle_id = Column(String, ForeignKey("vehicles.external_id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    vehicle = relationship("Vehicle", backref="driver")
