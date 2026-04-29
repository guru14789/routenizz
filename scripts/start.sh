#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  TNImpact Smart Route Engine — One-Command Startup
#  Usage:  ./start.sh
#  Stop:   Ctrl+C  (kills both backend and frontend cleanly)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ████████╗███╗   ██╗██╗███╗   ███╗██████╗  █████╗  ██████╗████████╗"
echo "     ██╔══╝████╗  ██║██║████╗ ████║██╔══██╗██╔══██╗██╔════╝╚══██╔══╝"
echo "     ██║   ██╔██╗ ██║██║██╔████╔██║██████╔╝███████║██║        ██║   "
echo "     ██║   ██║╚██╗██║██║██║╚██╔╝██║██╔═══╝ ██╔══██║██║        ██║   "
echo "     ██║   ██║ ╚████║██║██║ ╚═╝ ██║██║     ██║  ██║╚██████╗   ██║   "
echo "     ╚═╝   ╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝   "
echo ""
echo -e "            Smart Route Engine  •  v2.1  •  Tamil Nadu${RESET}"
echo ""

# ── Paths ─────────────────────────────────────────────────────────────────────
# Resolve to the project root (one level up from /scripts)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# PIDs file so Ctrl+C kills both processes
PID_FILE="$PROJECT_ROOT/.run_pids"
rm -f "$PID_FILE"

# ── Helper functions ──────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}▶ $*${RESET}"; }

# ── Shutdown handler: Ctrl+C kills both services ──────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}${BOLD}Shutting down TNImpact...${RESET}"
    if [[ -f "$PID_FILE" ]]; then
        while IFS= read -r pid; do
            kill "$pid" 2>/dev/null && echo -e "  ${RED}✖${RESET}  Stopped PID $pid" || true
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    echo -e "${GREEN}All services stopped. Goodbye!${RESET}\n"
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Check system dependencies
# ─────────────────────────────────────────────────────────────────────────────
step "Checking system dependencies"

# Preference for stable versions over experimental 3.14+
if command -v python3.13 &>/dev/null; then
    PY_CMD="python3.13"
elif command -v python3.12 &>/dev/null; then
    PY_CMD="python3.12"
else
    PY_CMD="python3"
fi

check_cmd() {
    if command -v "$1" &>/dev/null; then
        success "$1 found  ($(command -v "$1"))"
    else
        error "$1 is not installed. Install it and re-run."
        exit 1
    fi
}

check_cmd "$PY_CMD"
check_cmd node
check_cmd npm

PYTHON_VER=$("$PY_CMD" -c 'import sys; print(".".join(map(str,sys.version_info[:2])))')
NODE_VER=$(node --version)
NPM_VER=$(npm --version)
info "Using $PY_CMD ($PYTHON_VER)  |  Node $NODE_VER  |  npm $NPM_VER"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Python virtual environment
# ─────────────────────────────────────────────────────────────────────────────
step "Setting up Python virtual environment"

# Re-create venv if the python version changed (prevents pydantic build issues)
if [[ -d "$PROJECT_ROOT/venv" ]]; then
    VENV_PY_VER=$(venv/bin/python -c 'import sys; print(".".join(map(str,sys.version_info[:2])))' 2>/dev/null || echo "unknown")
    if [[ "$VENV_PY_VER" != "$PYTHON_VER" ]]; then
        info "Python version mismatch (Venv: $VENV_PY_VER, System: $PYTHON_VER). Re-creating venv..."
        rm -rf "$PROJECT_ROOT/venv"
    fi
fi

if [[ ! -d "$PROJECT_ROOT/venv" ]]; then
    info "Creating new venv with $PY_CMD..."
    "$PY_CMD" -m venv venv
    success "venv created"
else
    success "venv already exists — skipping creation"
fi

# Activate
# shellcheck disable=SC1091
source "$PROJECT_ROOT/venv/bin/activate"
success "venv activated: $(which python)"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Python dependencies
# ─────────────────────────────────────────────────────────────────────────────
step "Installing Python dependencies"

# Fix for latest Python versions (3.14+) which require forward compatibility for PyO3
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1

if pip install -r backend/requirements.txt -q; then
    success "Python packages installed"
else
    error "pip install failed. Check backend/requirements.txt."
    exit 1
fi

# Ensure internal modules (routing, ml, app) are discoverable by Celery and Uvicorn
export PYTHONPATH="$PROJECT_ROOT/backend"
success "PYTHONPATH configured: $PYTHONPATH"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Node dependencies
# ─────────────────────────────────────────────────────────────────────────────
step "Installing Node.js dependencies"

if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
    info "node_modules not found — running npm install..."
    npm install --silent
    success "npm packages installed"
else
    success "node_modules exists — skipping npm install"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Environment file check
# ─────────────────────────────────────────────────────────────────────────────
step "Checking environment configuration"

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    warn ".env file not found!"
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        warn "Copied .env.example → .env  (edit it with your Firebase keys)"
    else
        warn "Creating minimal .env with default localhost settings..."
        cat > "$PROJECT_ROOT/.env" << 'EOF'
PROJECT_NAME="TNImpact Smart Route Engine"
OSRM_URL="https://router.project-osrm.org"
LOG_LEVEL="INFO"
ENV="development"
VITE_API_BASE_URL="http://localhost:8001"
ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174"
EOF
    fi
fi
success ".env found"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Dependency & Infrastructure Check
# ─────────────────────────────────────────────────────────────────────────────
step "Verifying infrastructure availability"

check_port() {
    local port=$1
    local name=$2
    if lsof -ti:"$port" &>/dev/null; then
        warn "Port $port ($name) is already in use — recycling process..."
        kill -9 "$(lsof -ti:"$port")" 2>/dev/null || true
        sleep 1
        success "Port $port cleared"
    else
        success "Port $port ($name) is available"
    fi
}

check_port 8001 "FastAPI Backend"
check_port 5173 "Vite Frontend"

# Redis check (required for Celery/Task Queue)
if lsof -ti:6379 &>/dev/null; then
    success "Redis is running (Port 6379)"
else
    if command -v redis-server &>/dev/null; then
        info "Redis is not running. Starting local redis-server..."
        redis-server --daemonize yes 2>/dev/null || true
        sleep 1
        if lsof -ti:6379 &>/dev/null; then
            success "Redis started successfully"
        else
            warn "Failed to start Redis. Celery tasks may fail. Check your Redis installation."
        fi
    else
        warn "Redis server not found in PATH. Enterprise optimization (Celery) requires Redis."
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Start FastAPI backend (background)
# ─────────────────────────────────────────────────────────────────────────────
step "Igniting FastAPI ML Backend  (port 8001)"

# Start with a clean log
echo "--- TNImpact Backend Log Start: $(date) ---" > "$BACKEND_LOG"

uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --reload \
    --log-level warning \
    >> "$BACKEND_LOG" 2>&1 &

BACKEND_PID=$!
echo "$BACKEND_PID" >> "$PID_FILE"
info "Backend PID: $BACKEND_PID  |  Monitor with: tail -f logs/backend.log"

# STEP 7.1 — Start Celery Worker (Asynchronous Tasks)
step "Deploying Celery Background Workforce"

celery -A app.celery_worker.celery_app worker \
    --loglevel=warning \
    --pool=solo \
    > "$LOG_DIR/celery.log" 2>&1 &

CELERY_PID=$!
echo "$CELERY_PID" >> "$PID_FILE"
info "Celery PID: $CELERY_PID  |  Monitor with: tail -f logs/celery.log"

# Wait for backend to become healthy (up to 15 seconds)
info "Synchronizing with API gateway..."
for i in $(seq 1 15); do
    if curl -sf http://localhost:8001/health &>/dev/null; then
        success "Backend heartbeat detected  →  http://localhost:8001"
        break
    fi
    if [[ $i -eq 15 ]]; then
        warn "Backend took > 15s to respond. Check logs/backend.log if the frontend shows errors."
    fi
    sleep 1
done

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — Start Vite frontend (background)
# ─────────────────────────────────────────────────────────────────────────────
step "Starting React Frontend  (port 5173)"

npm run dev:frontend -- --host \
    > "$FRONTEND_LOG" 2>&1 &

FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"
info "Frontend PID: $FRONTEND_PID  |  log: logs/frontend.log"

# Wait for Vite to be listening
info "Waiting for frontend to compile..."
for i in $(seq 1 20); do
    if grep -q "Local:" "$FRONTEND_LOG" 2>/dev/null; then
        success "Frontend is UP  →  http://localhost:5173"
        break
    fi
    if [[ $i -eq 20 ]]; then
        warn "Vite took > 20s to start. Check logs/frontend.log"
    fi
    sleep 1
done

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9 — Open browser (macOS)
# ─────────────────────────────────────────────────────────────────────────────
step "Opening browser"
sleep 1
if command -v open &>/dev/null; then
    open "http://localhost:5173" 2>/dev/null && success "Browser opened"
elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:5173" 2>/dev/null && success "Browser opened"
else
    info "Open your browser manually: http://localhost:5173"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 10 — Running! Print access summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  ✅  TNImpact is running!${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Frontend (Admin + Driver):${RESET}  http://localhost:5173"
echo -e "  ${BOLD}Backend API Docs:${RESET}           http://localhost:8001/docs"
echo -e "  ${BOLD}Health Check:${RESET}               http://localhost:8001/health"
echo ""
# Show LAN IP for mobile access
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "N/A")
if [[ -n "$LAN_IP" && "$LAN_IP" != "N/A" ]]; then
echo -e "  ${BOLD}Mobile (LAN):${RESET}               http://${LAN_IP}:5173"
echo ""
fi
echo -e "  ${BOLD}Logs:${RESET}"
echo -e "    Backend  →  tail -f logs/backend.log"
echo -e "    Frontend →  tail -f logs/frontend.log"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${RESET}"
echo ""

# ── Keep script alive so Ctrl+C fires the cleanup trap ───────────────────────
wait
