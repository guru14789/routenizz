"""
ORION-ELITE: Full seed script — creates Vehicles, Orders, and EV charging stations.
Idempotent: wipes and recreates all data fresh.
Run: python scripts/seed_elite_data.py
"""
import asyncio, random
from sqlalchemy import delete
from app.utils.database import async_session, engine, Base
from app.models.db_models import Order, Vehicle, EVChargingStation

# ── Sample Data ───────────────────────────────────────────────────────────────

VEHICLES = [
    {"external_id": "V-001", "vehicle_type": "Van",       "capacity": 40,  "weight_capacity_kg": 800,  "volume_capacity_m3": 6.0,  "is_electric": False, "consumption_liters_per_100km": 10.5, "fuel_price_per_litre": 95.0, "cost_per_km": 1.5, "driver_hourly_wage": 250.0, "shift_end": 64800},
    {"external_id": "V-002", "vehicle_type": "Van",       "capacity": 40,  "weight_capacity_kg": 800,  "volume_capacity_m3": 6.0,  "is_electric": True,  "consumption_liters_per_100km": 0.0,  "fuel_price_per_litre": 0.0,  "cost_per_km": 0.8, "driver_hourly_wage": 250.0, "shift_end": 64800},
    {"external_id": "V-003", "vehicle_type": "Truck",     "capacity": 100, "weight_capacity_kg": 3000, "volume_capacity_m3": 18.0, "is_electric": False, "consumption_liters_per_100km": 18.0, "fuel_price_per_litre": 95.0, "cost_per_km": 2.8, "driver_hourly_wage": 300.0, "shift_end": 64800},
    {"external_id": "V-004", "vehicle_type": "Bike",      "capacity": 10,  "weight_capacity_kg": 30,   "volume_capacity_m3": 0.5,  "is_electric": True,  "consumption_liters_per_100km": 0.0,  "fuel_price_per_litre": 0.0,  "cost_per_km": 0.4, "driver_hourly_wage": 180.0, "shift_end": 64800},
    {"external_id": "V-005", "vehicle_type": "Tempo",     "capacity": 60,  "weight_capacity_kg": 1500, "volume_capacity_m3": 10.0, "is_electric": False, "consumption_liters_per_100km": 14.0, "fuel_price_per_litre": 95.0, "cost_per_km": 2.0, "driver_hourly_wage": 270.0, "shift_end": 64800},
]

ORDERS = [
    # (customer_name, lat, lng, priority, stop_type, weight_kg, volume_m3, demand_units, time_window_end)
    ("Sathya Electronics",       13.0592, 80.2478, 10, "Commercial",   45.0, 1.2, 3, 43200),
    ("Priya Residency",          13.0120, 80.2685, 5,  "Residential",  12.0, 0.4, 1, 50400),
    ("Chennai Pharma Hub",       13.0827, 80.2980, 10, "Medical",      8.0,  0.2, 2, 36000),
    ("Nungambakkam Office",      13.0569, 80.2425, 7,  "Commercial",   30.0, 0.9, 2, 54000),
    ("T. Nagar Silk Palace",     13.0411, 80.2337, 5,  "Commercial",   60.0, 2.1, 4, 61200),
    ("Adyar Kumar Home",         13.0063, 80.2574, 3,  "Residential",  9.0,  0.3, 1, 64800),
    ("Velachery Tech Park",      12.9815, 80.2180, 8,  "Corporate",    25.0, 0.8, 2, 46800),
    ("Ambattur Industrial",      13.1149, 80.1644, 8,  "Industrial",   90.0, 3.5, 5, 57600),
    ("Perambur Depot",           13.1183, 80.2393, 5,  "Depot",        55.0, 2.0, 3, 64800),
    ("Mylapore Heritage Stores", 13.0343, 80.2700, 5,  "Commercial",   18.0, 0.6, 2, 54000),
    ("Anna Nagar Grocery",       13.0898, 80.2123, 7,  "Retail",       40.0, 1.5, 3, 43200),
    ("Porur Logistics Hub",      13.0359, 80.1573, 6,  "Warehouse",    75.0, 2.8, 4, 64800),
    ("Guindy Showroom",          13.0069, 80.2206, 8,  "Commercial",   35.0, 1.1, 2, 50400),
    ("Sholinganallur IT Park",   12.9010, 80.2277, 9,  "Corporate",    20.0, 0.7, 2, 46800),
    ("Tambaram South Depot",     12.9249, 80.1000, 5,  "Depot",        80.0, 3.0, 5, 64800),
    ("Kodambakkam Film Studio",  13.0512, 80.2221, 3,  "Commercial",   15.0, 0.5, 1, 61200),
    ("Egmore Hospital",          13.0735, 80.2615, 10, "Medical",      5.0,  0.15,2, 32400),
    ("Besant Nagar Resident",    13.0006, 80.2660, 3,  "Residential",  10.0, 0.35,1, 64800),
    ("Madhavaram Cold Chain",    13.1521, 80.2378, 9,  "Cold Storage", 120.0,4.5, 6, 39600),
    ("Chromepet Warehouse",      12.9516, 80.1413, 6,  "Warehouse",    65.0, 2.5, 4, 57600),
]

CHARGING_STATIONS = [
    {"name": "Zeon Charging — Marina",      "lat": 13.0490, "lng": 80.2820, "charger_type": "Fast",         "provider": "Zeon"},
    {"name": "Tata Power — Egmore",          "lat": 13.0735, "lng": 80.2615, "charger_type": "Supercharger", "provider": "Tata Power"},
    {"name": "Relux Electric — Anna Nagar", "lat": 13.0850, "lng": 80.2110, "charger_type": "Fast",         "provider": "Relux"},
    {"name": "PlugNgo — T. Nagar",           "lat": 13.0410, "lng": 80.2330, "charger_type": "Slow",         "provider": "PlugNgo"},
    {"name": "BPCL EV — Velachery",          "lat": 12.9815, "lng": 80.2180, "charger_type": "Fast",         "provider": "BPCL"},
    {"name": "Ather Grid — Guindy",          "lat": 13.0069, "lng": 80.2206, "charger_type": "Fast",         "provider": "Ather"},
]


async def seed():
    print("🚀 Initializing ORION-ELITE Schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("🗑  Clearing existing data...")
    async with async_session() as session:
        await session.execute(delete(Order))
        await session.execute(delete(Vehicle))
        await session.execute(delete(EVChargingStation))
        await session.commit()

    print("🌱 Seeding ORION-ELITE production dataset...")
    async with async_session() as session:
        # 1. Vehicles
        for vd in VEHICLES:
            v = Vehicle(**vd, is_active=True)
            session.add(v)

        # 2. Orders
        for o_tuple in ORDERS:
            name, lat, lng, priority, stype, wkg, vm3, demand, tw_end = o_tuple
            o = Order(
                customer_name=name,
                destination_lat=lat,
                destination_lng=lng,
                priority=priority,
                stop_type=stype,
                weight_kg=wkg,
                volume_m3=vm3,
                demand_units=demand,
                time_window_end=tw_end,
                status="pending",
            )
            session.add(o)

        # 3. EV Stations
        for sd in CHARGING_STATIONS:
            station = EVChargingStation(**sd)
            session.add(station)

        await session.commit()

    print(f"✅ Seeding Complete!")
    print(f"   {len(VEHICLES)} vehicles | {len(ORDERS)} orders | {len(CHARGING_STATIONS)} EV stations")


if __name__ == "__main__":
    asyncio.run(seed())
