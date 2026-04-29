
# ORION-ELITE: Architecture Design
# TNImpact — Production-Grade VRP Platform

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ORION-ELITE SYSTEM ARCHITECTURE                     │
│                     "Dynamic, Explainable, Human-Aligned VRP"                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     HTTPS      ┌─────────────────────────────────────────┐
│   Browser    │ ◄──────────── │         Nginx API Gateway (:80)          │
│  (React UI)  │               │   - Rate Limiting                        │
└──────────────┘               │   - SSL Termination                      │
       │                       │   - Load Balancing                       │
       │ WebSocket             └───────────────┬─────────────────────────┘
       │ (live events)                         │
       ▼                          ┌────────────┴──────────────┐
┌──────────────┐                  │                           │
│  Socket.IO   │           ┌──────▼──────┐          ┌────────▼───────┐
│  Real-time   │           │  FastAPI    │          │  FastAPI        │
│  Feed        │           │  Main API   │          │  Driver API     │
│  (:8001)     │           │  (:8001)    │          │  (:8002)        │
└──────────────┘           └──────┬──────┘          └────────┬────────┘
                                  │                          │
                    ┌─────────────┼──────────────┐           │
                    │             │              │           │
             ┌──────▼──┐  ┌──────▼──┐  ┌────────▼──┐       │
             │Constraint│  │  VRP    │  │   Re-Opt  │       │
             │ Engine   │  │Optimizer│  │  Service  │       │
             │ Service  │  │ Service │  │(Event-Drv)│       │
             └──────┬───┘  └──────┬──┘  └────────┬──┘       │
                    │             │              │           │
                    └─────────────▼──────────────┘           │
                                  │                          │
                    ┌─────────────▼──────────────────────────▼──┐
                    │           Redis (Pub/Sub + Cache)           │
                    │   - Route cache (TTL: 5min)                 │
                    │   - Event channels: new_order, traffic,     │
                    │     driver_update, reopt_trigger             │
                    └──────────────────┬─────────────────────────┘
                                       │
              ┌────────────────────────▼─────────────────────────┐
              │                  PostgreSQL DB                    │
              │   Tables: orders, routes, vehicles, drivers,      │
              │            route_segments, telemetry_log,          │
              │            driver_intent, constraint_profiles      │
              └──────────────────────────────────────────────────┘

SERVICE INTERACTION FLOW:
━━━━━━━━━━━━━━━━━━━━━━━━━

1. NEW ORDER EVENT:
   Client → POST /api/v1/logistics/orders
   → Redis PUBLISH "new_order"
   → Re-Opt Service SUBSCRIBES → checks if reopt needed
   → If yes → VRP Solver → Incremental solve (only affected vehicles)
   → Redis PUBLISH "route_updated" → Socket.IO → Client updates map

2. TRAFFIC SPIKE:
   Traffic Poller → GET OSRM matrix every 5min
   → If drift > 15% → Redis PUBLISH "traffic_update"
   → Re-Opt Service → solve_vrp_delta()
   → Updated routes pushed to all connected drivers

3. DRIVER OVERRIDE:
   Driver App → POST /driver/v1/segment-feedback
   → Written to driver_intent table (PostgreSQL)
   → Intent Learning Service → updates preference_matrix in Redis
   → Next VRP solve incorporates learned weights

4. WHAT-IF SIMULATION:
   Admin → POST /api/v1/simulation/scenario
   → Simulation Service → Cloned solve environment
   → Returns comparison: [current vs simulated] with Explainability report
```
