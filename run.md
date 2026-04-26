# TNImpact: AI-Powered Smart Route Engine

This project is a high-fidelity route optimization platform specifically designed for logistics. It maps real-world **OpenStreetMap (OSRM)** paths and applies a **Random Forest Machine Learning Algorithm** to predict real-time traffic congestion, delivering an intelligent "Smart ETA" and dynamic rerouting capabilities.

---

## 🛠 Prerequisites

Ensure you have the following installed before starting:
- **Node.js**: v20 or higher
- **Python**: v3.11 or higher
- **Redis**: A running instance on `localhost:6379` (Required for caching and telemetry state).
- **Docker**: (Required for the local OSRM Routing Server)

---

## 🏗 Architecture Overview

We have migrated to a decoupled, high-performance architecture:
- **Backend**: FastAPI (Python) handles ML inference, OSRM communication, rate-limiting, and Redis caching.
- **Frontend**: React + Vite for high-speed map rendering and dashboard analytics.
- *(Note: The legacy Node.js Express backend has been entirely removed)*

---

## 🚦 Running the Application

### Phase 1: Start Infrastructure (Redis & OSRM)

**1. Redis Memory Store**: Ensure Redis is running in the background.
*(On Mac)*
```bash
brew services start redis
# Or via Docker: docker run -d -p 6379:6379 --name impact_redis redis
```

**2. OSRM Routing Engine**: Needs to be running on port 5000.
```bash
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/tamil-nadu-latest.osrm
```

### Phase 2: Start the Python FastAPI Engine

This is the core brain of the platform. It requires a virtual environment.
Open a new terminal at the root of the project:

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies (if not done)
pip install -r requirements.txt

# Run the Uvicorn ASGI server (Host on Port 8001)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```
*API Documentation (Swagger UI) will be automatically generated at: `http://127.0.0.1:8001/docs`*

### Phase 3: Start the React Dashboard

Open another terminal at the root of the project:

```bash
# Install NPM dependencies
npm install

# Start the Vite development server
npm run dev
```
*Visit `http://localhost:5173` to view the UI map interface and admin dashboard.*

---

## 📊 Model Training Pipeline

If you want to update the prediction logic using your own collected data:

```bash
source venv/bin/activate

# 1. Generate Synthetic Data (saves to data/traffic_data.csv)
python training/generate_dataset.py

# 2. Train the V2 Random Forest Model (saves to app/models/tn_route_model_v2.pkl)
python training/train_models.py
```

---

## 🧪 Testing the APIs (cURL)

You can verify the FastAPI system is working securely and efficiently:

**1. Health Check & Component Verification:**
```bash
curl http://127.0.0.1:8001/health
```

**2. Fast Caching ETA Prediction:**
```bash
curl -X POST http://127.0.0.1:8001/api/v1/eta/predict \
     -H "Content-Type: application/json" \
     -d '{"distance_km": 15.5, "road_type": 1}'
```

**3. Traffic Heatmap Generation:**
```bash
curl http://127.0.0.1:8001/api/v1/analytics/traffic-heatmap?hour=17
```

---

## 🔒 Production Security & Persistence
The system now includes an authentication layer and persistent telemetry:

**1. Authentication:**
- **Endpoint**: `/api/v1/auth/login`
- **Method**: POST (Form Data: `username`, `password`)
- **Default**: `admin / admin123`
- **JWT Protection**: The `/api/v1/logistics/optimize-route` endpoint now requires an `Authorization: Bearer <token>` header.

**2. Persistent Telemetry (Redis):**
- Vehicle positions are now cached in **Redis** with a 24-hour TTL, ensuring live tracking survives server restarts.

**3. Database Persistence:**
- Logistics metadata (orders, vehicle types) are now stored in an asynchronous SQLite database (`tn_logistics.db`).

---

## 🚀 Key Features

* **High Concurrency Optimization:** GZip compression, Redis 30-second TTL caching, and `slowapi` rate-limiting support 10,000+ concurrent ETA queries.
* **Persistent Telemetry:** Trip states and driver metrics are continuously updated and monitored with a 24-hour Redis TTL.
* **Intelligent Anti-Flapping Rerouting:** Automatically evaluates OSMR alternatives and triggers a reroute only if the ML-Smart ETA shows >5% improvement, enforcing a 5-minute cooldown.
