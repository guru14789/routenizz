"""
ORION-ELITE — Stage 3: Simulated Annealing
============================================
Stochastic acceptance criterion that wraps the ALNS loop.
Accepts worse solutions with probability P = exp(-delta / T), where T decreases
geometrically each iteration.  The global best is tracked separately and is
always the returned solution (never the last accepted state).

Parameters (tuned for TNImpact cost scale in INR × 100):
    T_start = 5000.0   (matches the ₹50 base segment cost × 100 scaling)
    T_end   = 1.0
    alpha   = 0.997    (slow cooling → thorough exploration)

Reference:
    Kirkpatrick, S., Gelatt, C.D. & Vecchi, M.P. (1983). Optimization by
    simulated annealing. Science, 220(4598), 671–680.
"""
from __future__ import annotations
import math
import time
from typing import Tuple, Dict, Callable
from app.engine.metaheuristics.solution import RouteSolution  # type: ignore
from app.core.logger import logger  # type: ignore


class SimulatedAnnealing:
    T_START: float = 5000.0
    T_END: float = 1.0
    ALPHA: float = 0.997    # cooling rate (0.99–0.999 typical for logistics)

    def build_acceptance_fn(
        self, iteration_counter: list
    ) -> Callable[[RouteSolution, RouteSolution], bool]:
        """
        Returns a closure used as `acceptance_fn` in ALNSOptimizer.optimize().

        The closure captures a mutable `iteration_counter` list (single-element)
        so the temperature progresses correctly as ALNS calls the function.

        Args:
            iteration_counter: [0] — mutated by ALNS to track current iteration

        Returns:
            Callable(current, candidate) → bool
        """
        t_start = self.T_START
        t_end = self.T_END
        alpha = self.ALPHA

        def accept(current: RouteSolution, candidate: RouteSolution) -> bool:
            i = iteration_counter[0]
            # Geometric cooling: T_i = T_start × alpha^i   (clamped at T_end)
            T = max(t_end, t_start * (alpha ** i))
            delta = candidate.total_cost - current.total_cost
            if delta <= 0:
                return True  # always accept improvements
            # Boltzmann acceptance
            try:
                prob = math.exp(-delta / T)
            except OverflowError:
                prob = 0.0
            import random
            return random.random() < prob

        return accept

    def run(
        self,
        solution: RouteSolution,
        alns_optimizer,
        time_limit: float = 2.5,
    ) -> Tuple[RouteSolution, Dict]:
        """
        Standalone SA runner (used when SA drives the outer loop directly,
        without ALNS in the pipeline).  For the combined SA+ALNS mode, call
        alns_optimizer.optimize(solution, acceptance_fn=self.build_acceptance_fn(...)).

        Returns (best_solution, stats_dict)
        """
        iteration_counter = [0]
        acceptance_fn = self.build_acceptance_fn(iteration_counter)

        start = time.monotonic()
        best, stats = alns_optimizer.optimize(
            solution,
            acceptance_fn=acceptance_fn,
            time_limit=time_limit,
        )
        elapsed = time.monotonic() - start

        # Compute final temperature (for reporting)
        n_iters = stats.get("alns_iterations", 1)
        final_T = max(self.T_END, self.T_START * (self.ALPHA ** n_iters))

        stats["sa_final_temperature"] = round(final_T, 2)
        stats["sa_elapsed_sec"] = round(elapsed, 3)

        logger.info(
            f"[SA] T_final={final_T:.2f} | "
            f"accepted_worse={stats.get('sa_accepted_worse', 0)} | "
            f"elapsed={elapsed:.2f}s"
        )
        return best, stats


# Module-level singleton
simulated_annealing = SimulatedAnnealing()
