"""
USES: Data validation and serialization schemas.
SUPPORT: Defines Pydantic models to enforce structural integrity for VRP requests, telemetry updates, and fleet performance responses.
"""
from pydantic import BaseModel, Field  # Import Pydantic base classes for declarative data modeling
from typing import List, Optional, Dict  # Import type hint containers for robust interface definitions

class Stop(BaseModel):  # Schema for a single delivery or service location
    """Represents a customer delivery point in the logistics network."""
    id: str  # Unique identifier for the order or stop (e.g., "ORD-001")
    name: str  # Human-readable name or label (e.g., "Customer A")
    lat: float  # Geographical Latitude of the stop
    lng: float  # Geographical Longitude of the stop
    demand_units: float = Field(default=1.0, ge=0)  # Weight or volume value to track vehicle capacity utilization
    service_time_minutes: int = Field(default=10, ge=0)  # Expected time overhead for the actual delivery action
    time_window_start: Optional[int] = 0  # Earliest arrival time in seconds from start of day
    time_window_end: Optional[int] = 86400  # Latest arrival time in seconds from start of day
    priority: int = Field(default=1, ge=1, le=10)  # Priority level (1=Low, 10=Critical)
    status: str = "Pending"  # Current execution state (Pending, Completed, or Failed)
    notes: Optional[str] = "N/A" # Gate codes, specific instructions for the driver
    loading_dock: Optional[str] = "Main Entrance" # Exact drop-off point to solve the 'Last-Meter Con'
    driverId: Optional[str] = None # The fleet ID assigned to this stop

class Vehicle(BaseModel):  # Schema for a fleet asset (Truck, Van, etc.)
    """Represents a driver and their specific vehicle in the fleet."""
    vehicle_id: str  # Unique identifier for the vehicle (e.g., "DRV-101")
    capacity: float = Field(default=100.0, gt=0)  # Maximum payload the vehicle can carry
    shift_start: int = 0  # Start time of the driver's shift in seconds
    shift_end: int = 86400  # End time of the driver's shift in seconds
    cost_per_km: float = 1.5  # Financial cost associated with travel distance
    fuel_type: str = "Diesel" # Mixed-Fleet support: Electric, Diesel, Petrol
    consumption_liters_per_100km: float = 12.0  # Fuel efficiency metric for cost estimation
    fuel_price_per_litre: float = 95.0  # Current fuel price to calculate total burn cost
    driver_hourly_wage: float = 250.0  # Fixed labor cost per hour of shift duration
    idle_cost_per_hour: float = 50.0  # Sunk cost when the vehicle is stationary during shift

class Depot(BaseModel):  # Schema for the central warehouse or office
    """Main distribution center location (Origin and Destination)."""
    lat: float  # Warehouse Latitude
    lng: float  # Warehouse Longitude

class OptimizationRequest(BaseModel):  # Schema for the VRP solve request
    """The complete payload required to trigger the VRP solver."""
    office: Depot  # The starting and ending location for all routes
    vehicles: List[Vehicle]  # The available fleet to handle the workload
    stops: List[Stop]  # The set of deliveries to be performed

class RouteSummary(BaseModel):  # Schema for high-level route metrics
    """Key performance metrics for a single vehicle's route."""
    vehicle_id: str  # Reference to the driver
    stops: List[Stop]  # Sequence of stops as determined by the optimizer
    distance_km: float  # Calculated street-level distance
    duration_min: float  # Calculated travel time including service overhead
    total_cost: float  # Aggregated financial cost of this specific route
    geometry: Optional[Dict] = None  # GeoJSON representation for frontend map rendering

class GlobalSummary(BaseModel):  # Schema for fleet-wide metrics
    """Enterprise-level KPIs for the entire optimization run."""
    total_vehicles_used: int  # Number of active drivers in this solution
    total_distance_km: float  # Total fuel-burn distance across all routes
    total_duration_min: float  # Total fleet time utilization
    total_cost: float  # Total financial burden of the entire delivery operation
    total_fuel_litres: float = 0.0 # Total estimated fuel burn (Sustainability KPI)
    status: str = "Success" # Optimization outcome status
    timestamp: float  # Precision timestamp for versioning the solution

class OptimizationResponse(BaseModel):  # Main response schema for the API
    """The finalized result of the VRP calculation."""
    routes: List[RouteSummary]  # Array of individual optimized routes
    summary: GlobalSummary  # Aggregated fleet performance data
    status: str = "Success"  # General process status flag
    cost_breakdown: dict
    optimization_score: float
