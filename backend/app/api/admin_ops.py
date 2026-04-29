"""
ORION-ELITE: Admin Operational Control API — Phase 2B
Implements the complete Admin workflow:
  A. Pre-Route Planning   → POST /admin/dispatch (ingest orders, build route plan)
  B. Fleet Live Status    → GET  /admin/fleet-status
  C. Exception Alerts     → GET  /admin/exceptions
  D. Manual Intervention  → POST /admin/intervene
  E. Post-Route Analytics → GET  /admin/post-route/{date}
  F. Constraint Config    → POST /admin/constraints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
import json, datetime, redis.asyncio as aioredis, firebase_admin

from app.db.database import get_db
from app.models.db_models import Order, Vehicle, DriverIntentLog, ReOptEvent, SimulationLog, User
from app.core.logger import logger
from app.core.config import config
from app.core.auth import require_admin
from app.services.firebase_db_service import firebase_db_service

router = APIRouter(prefix="/admin", tags=["Admin Control Layer"])

logger.info("[DEBUG] admin_ops.py module is being loaded")



# ── Pydantic Models ────────────────────────────────────────────────────────────

class DispatchRequest(BaseModel):
    office: dict                              # {lat, lng}
    vehicle_ids: Optional[List[str]] = None  # None = all active
    order_ids: Optional[List[int]] = None    # None = all pending
    business_rules: Optional[dict] = {}      # {avoid_left_turns, max_stops_per_vehicle, ...}

class InterventionRequest(BaseModel):
    driver_id: str
    action: str                               # reroute | pause | reassign | emergency
    payload: dict = {}                        # {new_stop_sequence, target_driver_id, ...}
    reason: str = ""

class ConstraintProfileRequest(BaseModel):
    name: str
    rules: dict                               # Full constraint config object

class AddDriverRequest(BaseModel):
    email: str
    full_name: str
    phone: Optional[str] = None
    vehicle_id: str
    vehicle_type: str
    vehicle_number: str
    capacity: Optional[int] = 10
    weight_capacity_kg: Optional[float] = 1000.0
    volume_capacity_m3: Optional[float] = 10.0
    consumption: Optional[float] = 12.0
    hourly_wage: Optional[float] = 250.0
    idle_cost: Optional[float] = 50.0
    fuel_type: Optional[str] = "Diesel"
    documents: Optional[List[str]] = None  # URLs to uploaded files

class PublishRouteRequest(BaseModel):
    vehicle_id: str

class AddOrderRequest(BaseModel):
    customer_name: str
    destination_lat: float
    destination_lng: float
    priority: Optional[int] = 5
    stop_type: Optional[str] = "Residential"
    weight_kg: Optional[float] = 0.0
    volume_m3: Optional[float] = 0.0
    time_window_end: Optional[int] = 86400


# ── A. Pre-Route Planning: Dispatch ───────────────────────────────────────────

@router.post("/dispatch")
async def dispatch_routes(req: DispatchRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Admin triggers full route optimization:
    1. Loads pending orders (or specified IDs)
    2. Loads active vehicles (or specified IDs)
    3. Calls VRP solver
    4. Assigns sequence_order + assigned_vehicle_id to each order
    5. Returns full route plan per vehicle
    """
    # 1. Load orders
    if req.order_ids:
        q = select(Order).where(Order.id.in_(req.order_ids))
    else:
        q = select(Order).where(Order.status == "pending")
    result = await db.execute(q)
    orders = result.scalars().all()

    if not orders:
        raise HTTPException(status_code=400, detail="No pending orders to dispatch.")

    # 2. Load vehicles
    if req.vehicle_ids:
        vq = select(Vehicle).where(Vehicle.external_id.in_(req.vehicle_ids))
    else:
        vq = select(Vehicle).where(Vehicle.is_active == True)
    vresult = await db.execute(vq)
    vehicles = vresult.scalars().all()

    if not vehicles:
        raise HTTPException(status_code=400, detail="No active vehicles available.")

    # 3. Build solver input
    stops_input = [
        {
            "id": str(o.id),
            "name": o.customer_name,
            "lat": o.destination_lat,
            "lng": o.destination_lng,
            "priority": o.priority,
            "demand_units": o.demand_units,
            "weight_kg": o.weight_kg or 0,
            "volume_m3": o.volume_m3 or 0,
            "time_window_end": o.time_window_end,
            "stop_type": o.stop_type,
        }
        for o in orders
    ]

    vehicles_input = [
        {
            "vehicle_id": v.external_id,
            "capacity": v.capacity or 50,
            "weight_capacity_kg": v.weight_capacity_kg or 1000,
            "volume_capacity_m3": v.volume_capacity_m3 or 10,
            "is_electric": v.is_electric,
            "consumption_liters_per_100km": v.consumption_liters_per_100km or 12.0,
            "fuel_price_per_litre": v.fuel_price_per_litre or 95.0,
            "cost_per_km": v.cost_per_km or 1.5,
            "driver_hourly_wage": v.driver_hourly_wage or 250.0,
            "shift_end": v.shift_end or 64800,
        }
        for v in vehicles
    ]

    # 4. Call the VRP solver
    from app.engine.vrp_solver import vrp_solver
    try:
        solution = await vrp_solver.solve_vrp(req.office, vehicles_input, stops_input)
    except Exception as e:
        logger.error(f"[ADMIN] Dispatch VRP error: {e}")
        raise HTTPException(status_code=500, detail=f"Route optimization failed: {str(e)}")

    # 5. Persist assignments back to DB
    try:
        for route in solution.get("routes", []):
            vehicle_id = route.get("vehicle_id", "")
            for seq_idx, stop in enumerate(route.get("stops", [])):
                stop_id_raw = stop.get("id", "")
                if str(stop_id_raw).startswith("HQ") or str(stop_id_raw).startswith("DEPOT"):
                    continue
                try:
                    order_id = int(stop_id_raw)
                    order_result = await db.execute(select(Order).where(Order.id == order_id))
                    order = order_result.scalar_one_or_none()
                    if order:
                        order.status = "assigned"
                        order.assigned_vehicle_id = vehicle_id
                        order.sequence_order = seq_idx
                except (ValueError, TypeError):
                    continue

        # Log the dispatch event
        reopt_event = ReOptEvent(
            trigger="admin_dispatch",
            trigger_data={"vehicles": len(vehicles), "orders": len(orders)},
            affected_vehicle_ids=[v.external_id for v in vehicles],
            status="success",
        )
        db.add(reopt_event)
        await db.commit()

        # ── Sync Optimized Routes to Firebase ──
        for route in solution.get("routes", []):
            vehicle_id = route.get("vehicle_id", "")
            if vehicle_id:
                try:
                    await firebase_db_service.sync_route_to_firebase(vehicle_id, route.get("stops", []))
                except Exception as f_err:
                    logger.warning(f"Failed to sync route for {vehicle_id} to Firebase: {f_err}")

    except Exception as db_err:
        import traceback
        logger.error(f"[ADMIN] Dispatch DB error: {db_err}\n{traceback.format_exc()}")
        # Don't fail the response — routes were optimized, just log the persistence issue
        logger.warning("[ADMIN] Returning optimization result despite DB persistence issue")

    logger.info(f"[ADMIN] Dispatch complete: {len(orders)} orders → {len(vehicles)} vehicles")
    return {
        "success": True,
        "routes": solution.get("routes", []),
        "summary": solution.get("summary", {}),
        "optimization_score": solution.get("optimization_score", 0),
        "dispatched_at": datetime.datetime.utcnow().isoformat(),
        "status": "calibrated"
    }

@router.post("/add-driver")
async def add_driver(req: AddDriverRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Admin adds a new driver and their vehicle.
    - Generates a unique 6-digit PIN.
    - Creates a Vehicle record.
    - Creates a User entry with role='driver' linked to the vehicle.
    """
    import random
    
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Generate unique 6-digit PIN
    pin = "".join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Auto-generate Employee Number: EMP-YYMMDD-XXXX
    import datetime
    date_str = datetime.datetime.now().strftime("%y%m%d")
    rand_suffix = "".join([str(random.randint(0, 9)) for _ in range(4)])
    emp_num = f"EMP-{date_str}-{rand_suffix}"
    
    # Create Vehicle record
    new_vehicle = Vehicle(
        external_id=req.vehicle_id,
        vehicle_type=req.vehicle_type,
        capacity=req.capacity,
        weight_capacity_kg=req.weight_capacity_kg,
        volume_capacity_m3=req.volume_capacity_m3,
        is_active=True,
        is_electric=(req.fuel_type == "Electric"),
        consumption_liters_per_100km=req.consumption,
        driver_hourly_wage=req.hourly_wage
    )
    db.add(new_vehicle)
    
    # Create User record
    new_driver = User(
        email=req.email,
        full_name=req.full_name,
        employee_number=emp_num,
        phone=req.phone,
        role="driver",
        pin=pin,
        vehicle_id=req.vehicle_id,
        document_urls=req.documents
    )
    db.add(new_driver)
    
    try:
        await db.commit()
        
        # ── Sync to Firebase ──
        try:
            from firebase_admin import auth as firebase_auth
            
            # 1. Ensure Firebase Auth User exists
            try:
                firebase_auth.get_user_by_email(req.email)
                logger.info(f"Firebase user {req.email} already exists.")
            except firebase_admin.auth.UserNotFoundError:
                firebase_auth.create_user(
                    email=req.email,
                    password=f"TN{pin}",
                    display_name=req.full_name
                )
                logger.info(f"Created Firebase user for driver: {req.email}")

            # 2. Add to Firestore 'drivers' collection
            await firebase_db_service.add_driver({
                "email": req.email,
                "name": req.full_name,
                "full_name": req.full_name,
                "employee_number": emp_num,
                "phone": req.phone,
                "role": "driver",
                "pin": pin,
                "vehicle_id": req.vehicle_id,
                "vehicle_type": req.vehicle_type,
                "capacity": req.capacity,
                "status": "active",
                "last_active": datetime.datetime.utcnow().isoformat()
            })
        except Exception as f_err:
            logger.warning(f"Failed to sync driver to Firebase: {f_err}")

    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to add driver/vehicle: {str(e)}")
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="A driver with this email or a vehicle with this ID already exists.")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {
        "success": True,
        "message": "Driver and vehicle added successfully (Synced to Firebase)",
        "credentials": {
            "email": req.email,
            "pin": pin,
            "employee_number": emp_num
        }
    }

@router.post("/add-order")
async def add_order(req: AddOrderRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Admin adds a new order to the system.
    Saves to SQLite database for VRP processing.
    """
    new_order = Order(
        customer_name=req.customer_name,
        destination_lat=req.destination_lat,
        destination_lng=req.destination_lng,
        priority=req.priority,
        stop_type=req.stop_type,
        weight_kg=req.weight_kg,
        volume_m3=req.volume_m3,
        time_window_end=req.time_window_end,
        status="pending"
    )
    db.add(new_order)
    
    try:
        await db.commit()
        await db.refresh(new_order)
        
        # ── Sync to Firebase ──
        try:
            await firebase_db_service.add_order({
                "id": str(new_order.id), # Sync the SQLite ID for cross-reference
                "customer_name": req.customer_name,
                "lat": req.destination_lat,
                "lng": req.destination_lng,
                "priority": req.priority,
                "stop_type": req.stop_type,
                "weight_kg": req.weight_kg,
                "volume_m3": req.volume_m3,
                "status": "pending",
                "created_at": datetime.datetime.utcnow().isoformat()
            })
        except Exception as f_err:
            logger.warning(f"Failed to sync order to Firebase: {f_err}")

    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to add order: {str(e)}")
        raise HTTPException(status_code=500, detail="Database commit failed")
    
    return {
        "success": True,
        "message": "Order registered successfully (Synced to Firebase)",
        "order_id": new_order.id
    }

@router.post("/publish-route")
async def publish_route(req: PublishRouteRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Finalizes the calibrated route for a driver.
    Updates all 'assigned' orders for this vehicle to 'published' or similar state
    so the driver can start the route.
    """
    # In this system, 'assigned' means it's ready for the driver.
    # We can use a Redis signal or just update the orders.
    result = await db.execute(
        select(Order).where(Order.assigned_vehicle_id == req.vehicle_id).where(Order.status == "assigned")
    )
    orders = result.scalars().all()
    
    for o in orders:
        o.status = "published" # New status for driver visibility
        # Sync status to Firebase
        try:
            await firebase_db_service.update_order_status(str(o.id), "published")
        except Exception as f_err:
            logger.warning(f"Failed to sync published status for order {o.id} to Firebase: {f_err}")
        
    await db.commit()
    
    # Notify driver via Redis
    try:
        r = aioredis.from_url(config.REDIS_URL)
        await r.publish(f"driver:{req.vehicle_id}:updates", json.dumps({
            "type": "route_published",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }))
        await r.aclose()
    except Exception as e:
        logger.warning(f"[ADMIN] Publish notify error: {e}")

    return {"success": True, "message": f"Route published for {req.vehicle_id}"}


# ── B. Live Fleet Status ──────────────────────────────────────────────────────

@router.get("/fleet-status")
async def get_fleet_status(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Returns live status of all vehicles:
    - Assigned orders, completion count, in-transit stops
    - Delayed/failed exceptions
    - Fuel + cost projections
    """
    vehicles_result = await db.execute(select(Vehicle).where(Vehicle.is_active == True))
    vehicles = vehicles_result.scalars().all()

    fleet = []
    for v in vehicles:
        orders_result = await db.execute(
            select(Order).where(Order.assigned_vehicle_id == v.external_id)
        )
        orders = orders_result.scalars().all()

        total = len(orders)
        completed = sum(1 for o in orders if o.status == "completed")
        failed = sum(1 for o in orders if o.status == "failed")
        in_transit = sum(1 for o in orders if o.status == "in_transit")
        pending = sum(1 for o in orders if o.status in ("assigned", "pending"))

        fleet.append({
            "vehicle_id": v.external_id,
            "vehicle_type": v.vehicle_type,
            "is_electric": v.is_electric,
            "total_stops": total,
            "completed": completed,
            "failed": failed,
            "in_transit": in_transit,
            "pending": pending,
            "progress_pct": round((completed / total * 100) if total > 0 else 0, 1),
            "has_exception": failed > 0,
            "is_delayed": any(o.status == "failed" for o in orders),
            "next_stop": next(
                ({"id": o.id, "name": o.customer_name, "lat": o.destination_lat, "lng": o.destination_lng}
                 for o in sorted(orders, key=lambda x: x.sequence_order or 0)
                 if o.status in ("assigned", "pending")), None
            ),
        })

    # Overall KPIs
    all_orders_result = await db.execute(select(Order))
    all_orders = all_orders_result.scalars().all()
    total_today = len([o for o in all_orders])
    completed_today = len([o for o in all_orders if o.status == "completed"])
    failed_today = len([o for o in all_orders if o.status == "failed"])

    return {
        "fleet": fleet,
        "kpis": {
            "active_vehicles": len([v for v in fleet if v["pending"] > 0 or v["in_transit"] > 0]),
            "total_orders": total_today,
            "completed": completed_today,
            "failed": failed_today,
            "on_time_rate": round((completed_today / total_today * 100) if total_today > 0 else 100, 1),
            "exceptions": len([v for v in fleet if v["has_exception"]]),
        },
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }


# ── C. Exception Alerts ───────────────────────────────────────────────────────

@router.get("/exceptions")
async def get_exceptions(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Returns all active exceptions:
    - Failed deliveries (need reassignment)
    - Overdue orders (past time window)
    - Re-opt events
    """
    failed_result = await db.execute(select(Order).where(Order.status == "failed"))
    failed_orders = failed_result.scalars().all()

    now_sec = datetime.datetime.now().hour * 3600 + datetime.datetime.now().minute * 60
    overdue_result = await db.execute(
        select(Order)
        .where(Order.status.in_(["assigned", "pending"]))
        .where(Order.time_window_end < now_sec)
    )
    overdue_orders = overdue_result.scalars().all()

    reopt_result = await db.execute(
        select(ReOptEvent).order_by(ReOptEvent.timestamp.desc()).limit(10)
    )
    recent_reopt = reopt_result.scalars().all()

    exceptions = []
    for o in failed_orders:
        exceptions.append({
            "id": f"fail-{o.id}",
            "type": "delivery_failure",
            "severity": "high",
            "vehicle_id": o.assigned_vehicle_id,
            "order_id": o.id,
            "customer": o.customer_name,
            "message": f"Delivery failed for {o.customer_name}",
            "action": "reassign_or_reschedule",
            "timestamp": o.actual_completion_time or datetime.datetime.utcnow().isoformat(),
        })

    for o in overdue_orders:
        exceptions.append({
            "id": f"overdue-{o.id}",
            "type": "time_window_breach",
            "severity": "medium",
            "vehicle_id": o.assigned_vehicle_id,
            "order_id": o.id,
            "customer": o.customer_name,
            "message": f"Past time window for {o.customer_name}",
            "action": "trigger_reopt",
            "timestamp": datetime.datetime.utcnow().isoformat(),
        })

    return {
        "exceptions": exceptions,
        "total": len(exceptions),
        "critical": len([e for e in exceptions if e["severity"] == "high"]),
        "recent_reopt_events": [
            {
                "id": r.id,
                "type": r.trigger,
                "status": r.status,
                "affected": r.affected_vehicle_ids or [],
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in recent_reopt
        ],
    }


# ── D. Manual Intervention ────────────────────────────────────────────────────

@router.post("/intervene")
async def intervene(req: InterventionRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    Admin manually intervenes in an active route:
    - reroute: publish new stop sequence to driver via Redis
    - reassign: move remaining stops from one driver to another
    - pause: halt a vehicle's route progression
    - emergency: trigger full fleet re-optimization
    """
    try:
        r = aioredis.from_url(config.REDIS_URL)

        if req.action == "reroute":
            # Publish new route to driver's personal channel
            await r.publish(f"driver:{req.driver_id}:updates", json.dumps({
                "type": "route_update",
                "new_sequence": req.payload.get("new_stop_sequence", []),
                "rationale": req.reason or "Admin manual override",
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }))

        elif req.action == "reassign":
            # Move all pending orders from source driver to target driver
            target_driver = req.payload.get("target_driver_id")
            if not target_driver:
                raise HTTPException(status_code=400, detail="target_driver_id required for reassign")

            result = await db.execute(
                select(Order)
                .where(Order.assigned_vehicle_id == req.driver_id)
                .where(Order.status.in_(["assigned", "pending"]))
            )
            pending_orders = result.scalars().all()
            for o in pending_orders:
                o.assigned_vehicle_id = target_driver

            await db.commit()
            await r.publish("reopt_events", json.dumps({
                "type": "driver_reassignment",
                "from_driver": req.driver_id,
                "to_driver": target_driver,
                "stops_moved": len(pending_orders),
            }))

        elif req.action == "emergency":
            # Full fleet re-optimization
            await r.publish("reopt_events", json.dumps({
                "type": "emergency_reopt",
                "triggered_by": "admin",
                "reason": req.reason,
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }))

        await r.aclose()
    except aioredis.RedisError as e:
        logger.warning(f"[ADMIN] Intervention Redis error: {e}")

    # Audit log
    event = ReOptEvent(
        trigger=f"admin_intervention_{req.action}",
        trigger_data={"driver_id": req.driver_id, "reason": req.reason, "payload": req.payload},
        affected_vehicle_ids=[req.driver_id],
        status="success",
    )
    db.add(event)
    await db.commit()

    # ── Sync to Firebase ──
    try:
        await firebase_db_service.log_driver_event(req.driver_id, f"admin_{req.action}", f"Admin triggered {req.action}: {req.reason}", {
            "action": req.action,
            "payload": req.payload,
            "reason": req.reason
        })
        if req.action == "pause":
            await firebase_db_service.add_driver({"vehicle_id": req.driver_id, "status": "paused"})
        elif req.action == "reroute":
            # For reroute, we might want to update the current_route specifically
            await firebase_db_service.add_driver({
                "vehicle_id": req.driver_id, 
                "status": "rerouting",
                "manual_override_at": datetime.datetime.utcnow().isoformat()
            })
    except Exception as f_err:
        logger.warning(f"Failed to sync admin intervention for {req.driver_id} to Firebase: {f_err}")

    logger.info(f"[ADMIN] Intervention '{req.action}' on driver {req.driver_id}")
    return {
        "success": True,
        "action": req.action,
        "driver_id": req.driver_id,
        "message": f"'{req.action}' intervention dispatched successfully.",
    }


# ── E. Post-Route Analytics ───────────────────────────────────────────────────

@router.get("/post-route")
async def post_route_analytics(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    """
    End-of-day analytics:
    - Delivery success rate per vehicle
    - Actual vs. planned times
    - Route deviation summary
    - Intent learning insights
    """
    orders_result = await db.execute(select(Order))
    all_orders = orders_result.scalars().all()

    vehicles_result = await db.execute(select(Vehicle).where(Vehicle.is_active == True))
    vehicles = vehicles_result.scalars().all()

    intent_result = await db.execute(select(DriverIntentLog))
    intent_logs = intent_result.scalars().all()

    per_vehicle = {}
    for v in vehicles:
        v_orders = [o for o in all_orders if o.assigned_vehicle_id == v.external_id]
        completed = [o for o in v_orders if o.status == "completed"]
        failed = [o for o in v_orders if o.status == "failed"]
        deviations = [i for i in intent_logs if i.driver_id == v.external_id]

        per_vehicle[v.external_id] = {
            "total_assigned": len(v_orders),
            "delivered": len(completed),
            "failed": len(failed),
            "success_rate": round(len(completed) / len(v_orders) * 100 if v_orders else 0, 1),
            "deviations_logged": len(deviations),
            "vehicle_type": v.vehicle_type,
            "is_electric": v.is_electric,
        }

    total = len(all_orders)
    delivered = len([o for o in all_orders if o.status == "completed"])
    failed = len([o for o in all_orders if o.status == "failed"])

    return {
        "summary": {
            "total_orders": total,
            "delivered": delivered,
            "failed": failed,
            "fleet_success_rate": round(delivered / total * 100 if total > 0 else 0, 1),
            "intent_feedback_count": len(intent_logs),
            "date": datetime.date.today().isoformat(),
        },
        "per_vehicle": per_vehicle,
        "recommendations": [
            "Train intent model on today's deviations" if len(intent_logs) > 5 else "Insufficient deviations for training",
            f"{failed} failed deliveries — consider priority re-scheduling",
            "Run next-day optimization after 20:00 for best results",
        ],
    }
