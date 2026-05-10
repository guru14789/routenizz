"""
OSRM Circuit Breaker — ORION-ELITE Infrastructure Hardening
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Implements the Circuit Breaker pattern for OSRM HTTP calls.

States:
    CLOSED  → Normal operation. Requests pass through.
    OPEN    → OSRM is down. Requests fail fast (no network call).
    HALF-OPEN → Testing if OSRM recovered. One probe request allowed.

Benefits:
    - Prevents cascading failures when OSRM is unreachable
    - Falls back to geometric (Haversine) matrix automatically
    - Self-heals: transitions back to CLOSED once OSRM responds
"""

import asyncio
import time
from enum import Enum
from typing import Callable, Any

from app.core.logger import logger
from app.core.config import config


class CircuitState(Enum):
    CLOSED = "CLOSED"       # Normal operation
    OPEN = "OPEN"           # Failing fast
    HALF_OPEN = "HALF_OPEN" # Testing recovery


class OSRMCircuitBreaker:
    """
    Thread-safe circuit breaker for OSRM HTTP routing calls.

    Usage:
        @osrm_circuit_breaker.call
        async def fetch_matrix(...): ...

        Or manually:
        result = await osrm_circuit_breaker.execute(my_coroutine)
    """

    def __init__(
        self,
        failure_threshold: int | None = None,
        timeout_sec: float | None = None,
    ):
        self._failure_threshold = failure_threshold or config.OSRM_CIRCUIT_FAILURE_THRESHOLD
        self._timeout_sec = timeout_sec or config.OSRM_CIRCUIT_TIMEOUT_SEC
        self._failure_count = 0
        self._last_failure_time: float | None = None
        self._state = CircuitState.CLOSED
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def is_available(self) -> bool:
        """Returns True if the circuit allows requests to pass through."""
        return self._state != CircuitState.OPEN

    async def execute(self, coro_fn: Callable, *args, **kwargs) -> Any:
        """
        Execute a coroutine through the circuit breaker.

        Args:
            coro_fn: An async callable (coroutine function).
            *args, **kwargs: Arguments forwarded to coro_fn.

        Returns:
            Result of coro_fn, or raises CircuitOpenError.
        """
        async with self._lock:
            if self._state == CircuitState.OPEN:
                # Check if timeout has elapsed for recovery probe
                if (
                    self._last_failure_time
                    and time.monotonic() - self._last_failure_time >= self._timeout_sec
                ):
                    self._state = CircuitState.HALF_OPEN
                    logger.info("[CircuitBreaker] OSRM → HALF_OPEN: probing recovery...")
                else:
                    elapsed = int(time.monotonic() - (self._last_failure_time or 0))
                    logger.warning(
                        f"[CircuitBreaker] OSRM circuit OPEN. "
                        f"Fails={self._failure_count}. "
                        f"Retry in {max(0, int(self._timeout_sec) - elapsed)}s."
                    )
                    raise CircuitOpenError("OSRM circuit breaker is OPEN — using geometric fallback.")

        # Attempt the actual call
        try:
            result = await coro_fn(*args, **kwargs)
            await self._on_success()
            return result
        except CircuitOpenError:
            raise
        except Exception as exc:
            await self._on_failure(exc)
            raise

    async def _on_success(self):
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                logger.info("[CircuitBreaker] OSRM probe succeeded → CLOSED.")
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._last_failure_time = None

    async def _on_failure(self, exc: Exception):
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            logger.warning(
                f"[CircuitBreaker] OSRM failure #{self._failure_count}: {exc}"
            )
            if self._failure_count >= self._failure_threshold:
                if self._state != CircuitState.OPEN:
                    logger.error(
                        f"[CircuitBreaker] OSRM → OPEN after {self._failure_count} failures. "
                        f"Geometric fallback will be used for {self._timeout_sec}s."
                    )
                self._state = CircuitState.OPEN

    def reset(self):
        """Manually reset the circuit breaker (useful for tests or admin endpoints)."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        logger.info("[CircuitBreaker] Manually reset to CLOSED.")


class CircuitOpenError(Exception):
    """Raised when a request is blocked by an open circuit breaker."""
    pass


# Module-level singleton — import and use directly in vrp_solver.py
osrm_circuit_breaker = OSRMCircuitBreaker()
