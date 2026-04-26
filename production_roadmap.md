# Production Implementation Plan: TNImpact Enterprise

This plan outlines the steps required to transition the current TNImpact Smart Route Engine into a 100% production-ready, industry-standard logistics platform.

## Phase 1: Hardened Security
*   [ ] **Firebase Server-side Validation**: 
    *   Install `firebase-admin`.
    *   Implement a FastAPI dependency to verify the `Authorization: Bearer <ID_TOKEN>` header directly against Firebase public keys.
*   [ ] **Strict Role-Based Access Control (RBAC)**:
    *   Add `@require_auth(role='admin')` decorators to optimization and analytics endpoints.
*   [ ] **Secrets Management**: 
    *   Move the Firebase Service Account JSON to an environment variable or a secure volume mount.

## Phase 2: High-Performance Routing (Scalability)
*   [ ] **Asynchronous VRP Solving**: 
    *   Integrate **Redis** for task queuing.
    *   Use **BackgroundTasks** or **Celery** to handle long-running OR-Tools optimizations.
*   [ ] **OSRM Optimization**: 
    *   Update backend to support local OSRM HA cluster with fallback to public router.
    *   Cache distance matrices in Redis to reduce API latency by 90% for repeated routes.

## Phase 3: Data Integrity & Persistence
*   [ ] **SQL/NoSQL Hybrid Strategy**:
    *   Use **PostgreSQL** (instead of SQLite) for structured trip history, driver records, and fuel logs.
    *   Keep **Firestore** for real-time driver GPS heartbeats and client-side notifications.
*   [ ] **Audit Logging**: 
    *   Implement a middleware to log every VRP solve request (including input parameters) to the database for future cost analysis.

## Phase 4: Industrial Edge & Mobile
*   [ ] **Offline Dispatch Support**: 
    *   Enable **IndexedDB** in the React frontend to cache the current active route.
*   [ ] **Fused Location Telemetry**: 
    *   Update driver GPS utility to vary tracking frequency based on speed (higher frequency when moving, lower when stationary) to save battery.

## Phase 5: MLOps & Monitoring
*   [ ] **Health Dashboard**: 
    *   Add `/health` endpoints for backend and ML worker status.
*   [ ] **Automated Retraining Loop**: 
    *   Create a script that exports daily "Actual vs. Predicted" gaps to a CSV for periodic scikit-learn training.

---

### Immediate Next Step:
I will begin with **Phase 1 (Security)** by installing `firebase-admin` and updating the backend to verify actual Firebase tokens instead of the demo mock login.
