# ORION-ELITE: Complete Deployment Guide — PHASE 9

## Overview

ORION-ELITE is a production-grade VRP platform that surpasses UPS ORION across every dimension.  
A developer can clone this repo, run one command, and have a fully operational system.

---

## PHASE 9.1 — Local Setup (Developer)

### Prerequisites
```bash
# Required tools
node >= 20, python >= 3.11, docker >= 24, docker compose >= 2.20
```

### Step 1: Clone & Configure
```bash
git clone <your-repo>
cd tnimpact
cp .env.example .env
# Edit .env — fill in Firebase keys + set POSTGRES_PASSWORD
```

### Step 2: Start Full Stack (Single Command)
```bash
docker compose up --build
```

This starts:
| Service       | URL                        | Purpose                          |
|---------------|----------------------------|----------------------------------|
| Backend       | http://localhost:8001      | FastAPI ORION-ELITE Engine       |
| Frontend      | http://localhost:5173      | React Dispatcher Dashboard       |
| Nginx Gateway | http://localhost:80        | API Gateway + SSE proxy          |
| PostgreSQL    | localhost:5432             | Primary DB                       |
| Redis         | localhost:6380             | Broker + Pub/Sub + Cache         |
| Celery Worker | (internal)                 | Async VRP + Re-Opt tasks         |

### Step 3: Run Database Migrations
```bash
docker compose exec backend alembic upgrade head
```

### Step 4: Verify System Health
```bash
curl http://localhost:8001/health | python3 -m json.tool
# Expected: { "status": "ok", all dependencies "connected" }
```

---

## PHASE 9.2 — Local Native Setup (Without Docker)

```bash
# Backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Celery Worker (separate terminal)
celery -A app.celery_worker.celery_app worker --loglevel=info --concurrency=2

# Frontend (separate terminal)
npm install && npm run dev
```

---

## PHASE 9.3 — Running Tests

```bash
# All ORION-ELITE tests
pytest tests/test_orion_elite.py -v

# With coverage report
pytest tests/test_orion_elite.py -v --cov=routing --cov=services --cov-report=term-missing

# Single test class
pytest tests/test_orion_elite.py::test_constraint_engine_capacity_violation -v
```

---

## PHASE 9.4 — Cloud Deployment (AWS ECS / GCP Cloud Run)

### Option A: AWS ECS (Fargate)
```bash
# 1. Build and push image
aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-url>
docker build -t orion-backend:3.0.0 .
docker tag orion-backend:3.0.0 <ecr-url>/orion-backend:3.0.0
docker push <ecr-url>/orion-backend:3.0.0

# 2. Deploy via task definition (use infra/ecs/task-definition.json)
aws ecs update-service --cluster orion-cluster --service orion-backend --force-new-deployment
```

### Option B: GCP Cloud Run
```bash
gcloud builds submit --tag gcr.io/<project>/orion-backend:3.0.0
gcloud run deploy orion-backend \
  --image gcr.io/<project>/orion-backend:3.0.0 \
  --platform managed \
  --region asia-south1 \
  --set-env-vars REDIS_URL=<redis-url>,DATABASE_URL=<pg-url>
```

### Option C: Kubernetes (Any Cloud)
```bash
# 1. Create secrets
kubectl create secret generic orion-secrets \
  --from-literal=POSTGRES_USER=tnimpact \
  --from-literal=POSTGRES_PASSWORD=<strong-password> \
  --from-literal=FIREBASE_CREDENTIALS=<json-string>

# 2. Deploy all services
kubectl apply -f infra/k8s/orion-elite.yaml

# 3. Verify
kubectl get pods -n default
kubectl get ingress orion-ingress

# 4. Scale workers for demand spikes
kubectl scale deployment orion-worker --replicas=6
```

---

## PHASE 9.5 — API Quick Reference

| Method | Endpoint                              | Description                          |
|--------|---------------------------------------|--------------------------------------|
| GET    | /health                               | System health (all dependencies)     |
| POST   | /api/v1/logistics/optimize-route      | Full VRP optimization                |
| GET    | /api/v1/tasks/status/{id}             | Check async task status              |
| GET    | /api/v1/tasks/live-events             | SSE stream (real-time events)        |
| POST   | /api/v1/simulation/run                | Run what-if scenario                 |
| GET    | /api/v1/simulation/scenarios          | List available scenarios             |
| GET    | /api/v1/analytics/summary             | Fleet KPIs + sustainability metrics  |
| POST   | /api/v1/auth/register                 | Register admin/driver                |
| POST   | /api/v1/auth/login                    | Login (email + password)             |

---

## PHASE 9.6 — ORION vs ORION-ELITE Feature Matrix

| Dimension              | UPS ORION          | ORION-ELITE (TNImpact)             |
|------------------------|--------------------|------------------------------------|
| Route Adaptation       | Static (morning)   | ✅ Dynamic — re-opts every 5min    |
| Recompute Speed        | Full fleet rescan  | ✅ Incremental delta-patch         |
| Constraints            | Rigid (hard only)  | ✅ Soft + Hard + Priority tiers    |
| Explainability         | None               | ✅ Full rationale per decision     |
| Driver Learning        | None               | ✅ Intent learning from overrides  |
| Simulation             | None               | ✅ 4 scenario types + comparison   |
| EV Optimization        | Basic              | ✅ 15% cost bonus + EV routing     |
| Live Traffic           | Partial            | ✅ OSRM matrix drift detection     |
| Scalability            | Enterprise only    | ✅ K8s HPA: 2-10 worker replicas   |
| Deployment             | Proprietary        | ✅ docker compose up --build       |

---

## PHASE 9.7 — Monitoring & Observability

```bash
# Prometheus metrics
curl http://localhost:8001/metrics

# Celery monitoring (Flower UI)
docker run -p 5555:5555 mher/flower celery flower \
  --broker=redis://localhost:6380/0 --port=5555

# PostgreSQL audit trail
psql -U tnimpact -d tnimpact -c "SELECT * FROM reopt_events ORDER BY timestamp DESC LIMIT 10;"
psql -U tnimpact -d tnimpact -c "SELECT * FROM simulation_log ORDER BY created_at DESC LIMIT 5;"
```
