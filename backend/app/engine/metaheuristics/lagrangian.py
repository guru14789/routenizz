"""
ORION-ELITE — Stage 4: Lagrangian Relaxation
==============================================
Computes a theoretical lower bound on the VRP objective by relaxing the
capacity constraints into the cost function as penalty terms.
Uses subgradient optimisation to iteratively tighten the bound.

Why this matters:
    The lower bound lets us report an "optimality gap" — how far our solution
    is from the mathematical minimum. It also feeds back into the SA acceptance
    criterion: if a candidate solution falls below the LR lower bound it is
    mathematically infeasible and rejected outright.

Algorithm (Subgradient):
    For each constraint violation v_k (capacity overflow on vehicle k):
        λ_{k+1} = max(0,  λ_k  +  step_k × v_k)

    Polyak step size:
        step_k = θ × (UB - L_k) / ||v||²
        θ starts at 2.0 and halves every 10 stagnant iterations.

Reference:
    Fisher, M.L. (1981). The Lagrangian relaxation method for solving integer
    programming problems. Management Science, 27(1), 1–18.
"""
from __future__ import annotations
import math
from typing import Dict, List, Tuple
from app.engine.metaheuristics.solution import RouteSolution  # type: ignore
from app.core.logger import logger  # type: ignore


class LagrangianRelaxation:
    MAX_SUBGRADIENT_ITERS: int = 30
    THETA_INIT: float = 2.0       # Polyak step scaling
    THETA_MIN: float = 0.01
    STAGNATION_LIMIT: int = 10    # halve θ after this many non-improving iters

    def compute_lower_bound(
        self, solution: RouteSolution
    ) -> Tuple[float, Dict]:
        """
        Run subgradient optimisation and return the Lagrangian lower bound.
        Uses ergodic averaging for stable convergence near optimum.

        Returns:
            (lower_bound, stats_dict)
        """
        n_vehicles = len(solution.vehicles)

        # Initialise Lagrange multipliers (one per vehicle capacity constraint)
        lambdas: List[float] = [0.0] * n_vehicles

        upper_bound = solution.total_cost  # best known feasible solution cost
        best_lb = float("-inf")
        theta = self.THETA_INIT
        stagnant = 0
        lb_history: List[float] = []  # ergodic averaging buffer

        for k in range(self.MAX_SUBGRADIENT_ITERS):
            # ── 1. Compute Lagrangian objective (relax capacity constraints) ──
            l_cost, violations = self._lagrangian_cost(solution, lambdas)
            lb_history.append(l_cost)

            # ── 2. Ergodic average lower bound (more stable than point estimate) ──
            ergodic_lb = sum(lb_history) / len(lb_history)

            if ergodic_lb > best_lb:
                best_lb = ergodic_lb
                stagnant = 0
            else:
                stagnant += 1
                if stagnant >= self.STAGNATION_LIMIT:
                    theta = max(self.THETA_MIN, theta / 2.0)
                    stagnant = 0

            # ── 3. Subgradient step ───────────────────────────────────────────
            sq_norm = sum(v ** 2 for v in violations)
            if sq_norm < 1e-9:
                # All constraints satisfied → perfect lower bound found
                break

            step = theta * (upper_bound - best_lb) / sq_norm
            for v_idx in range(n_vehicles):
                lambdas[v_idx] = max(0.0, lambdas[v_idx] + step * violations[v_idx])

        # ── Compute optimality gap ─────────────────────────────────────────────
        gap_pct = 0.0
        if best_lb > 0 and upper_bound > 0:
            gap_pct = round((upper_bound - best_lb) / best_lb * 100, 2)

        stats = {
            "lagrangian_bound": round(best_lb, 2),
            "optimality_gap_pct": gap_pct,
            "lagrangian_iters": k + 1,
            "final_lambdas": [round(l, 4) for l in lambdas],
        }

        logger.info(
            f"[LR] Lower bound={best_lb:.1f} | UB={upper_bound:.1f} | "
            f"Gap={gap_pct:.2f}% | iters={k+1}"
        )
        return best_lb, stats

    def _lagrangian_cost(
        self,
        solution: RouteSolution,
        lambdas: List[float],
    ) -> Tuple[float, List[float]]:
        """
        Evaluate the Lagrangian relaxation objective:
            L(λ) = travel_cost  +  Σ_k  λ_k × (load_k − capacity_k)

        Violations v_k = load_k − capacity_k:
          positive = infeasible (capacity exceeded), 0 = tight, negative = slack.

        Note: We ADD the penalty (not subtract) because violations increase cost.
        This follows Fisher (1981) — relaxing capacity into the primal objective.
        """
        travel_cost = solution.compute_total_cost()
        violations: List[float] = []
        penalty_sum = 0.0

        for v_idx, route in enumerate(solution.routes):
            if v_idx >= len(solution.vehicles):
                break
            cap = float(solution.vehicles[v_idx].get("capacity", 100))
            load = float(solution.route_demand(route))
            violation = load - cap  # positive = capacity exceeded
            violations.append(violation)
            penalty_sum += lambdas[v_idx] * violation

        # BUG FIX: l_cost = travel_cost + penalty (was incorrectly subtracting)
        # Penalizing infeasibility RAISES the cost, tightening the relaxation.
        l_cost = travel_cost + penalty_sum

        return l_cost, violations

    def is_above_lower_bound(self, cost: float, lower_bound: float) -> bool:
        """Returns True if `cost` is above the LR lower bound (i.e. physically possible)."""
        return cost >= lower_bound - 1e-6


# Module-level singleton
lagrangian_relaxation = LagrangianRelaxation()
