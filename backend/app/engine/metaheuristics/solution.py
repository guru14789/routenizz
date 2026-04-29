"""
ORION-ELITE: Shared Solution Representation
============================================
All metaheuristic modules operate on `RouteSolution` objects.

`routes`  — list of node-index sequences, one per vehicle.
             Each route: [0, stop_a, stop_b, ..., 0]  (depot = index 0)
`matrix`  — NxN integer travel-time matrix (seconds)
`stops`   — ordered list of stop dicts (index i → stops[i-1], depot is index 0)
`vehicles`— list of vehicle dicts with capacity/weight constraints
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any
import copy


@dataclass
class RouteSolution:
    routes: List[List[int]]          # node sequences, one per vehicle
    matrix: List[List[int]]          # NxN travel-time matrix
    stops: List[Dict[str, Any]]      # stop metadata (0-indexed; stop i → index i+1)
    vehicles: List[Dict[str, Any]]   # vehicle metadata
    total_cost: float = 0.0          # cached total cost (INR × 100 for OR-Tools compat)

    # ─── Internal constraint parameters ────────────────────────────────────────
    _lambda_capacity: List[float] = field(default_factory=list)   # LR multipliers
    _lambda_time: List[float] = field(default_factory=list)

    # ─── Cost helpers ──────────────────────────────────────────────────────────
    def route_travel_cost(self, route: List[int]) -> float:
        """Sum of arc travel times along a single route (seconds, used as proxy cost)."""
        if len(route) < 2:
            return 0.0
        n = len(self.matrix)
        cost = 0.0
        for i in range(len(route) - 1):
            a, b = route[i], route[i + 1]
            if 0 <= a < n and 0 <= b < n:
                cost += self.matrix[a][b]
        return cost

    def compute_total_cost(self) -> float:
        """Recomputes and caches total_cost across all vehicle routes."""
        self.total_cost = sum(self.route_travel_cost(r) for r in self.routes)
        return self.total_cost

    # ─── Feasibility helpers ───────────────────────────────────────────────────
    def route_demand(self, route: List[int]) -> int:
        """Total demand units carried on this route (excluding depot)."""
        total = 0
        for node in route:
            if node > 0:
                total += int(self.stops[node - 1].get("demand_units", 1))
        return total

    def is_capacity_feasible(self, v_idx: int, route: List[int]) -> bool:
        """Returns True if the route respects the vehicle's capacity limit."""
        cap = int(float(self.vehicles[v_idx].get("capacity", 100)))
        return self.route_demand(route) <= cap

    def is_feasible(self) -> bool:
        """Returns True only if ALL vehicle routes are capacity-feasible."""
        for v_idx, route in enumerate(self.routes):
            if v_idx >= len(self.vehicles):
                break
            if not self.is_capacity_feasible(v_idx, route):
                return False
        return True

    # ─── Utility ──────────────────────────────────────────────────────────────
    def clone(self) -> "RouteSolution":
        """Deep copy so algorithms can work on independent candidate solutions."""
        c = RouteSolution(
            routes=copy.deepcopy(self.routes),
            matrix=self.matrix,           # matrix is read-only — share reference
            stops=self.stops,             # stops/vehicles are read-only — share
            vehicles=self.vehicles,
            total_cost=self.total_cost,
            _lambda_capacity=copy.copy(self._lambda_capacity),
            _lambda_time=copy.copy(self._lambda_time),
        )
        return c

    def unassigned_stops(self) -> List[int]:
        """Returns node indices not present in any route (excluding depot 0)."""
        all_nodes = set(range(1, len(self.stops) + 1))
        assigned = set()
        for route in self.routes:
            for n in route:
                if n != 0:
                    assigned.add(n)
        return list(all_nodes - assigned)
