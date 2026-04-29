"""
ORION-ELITE — Stage 1: Lin-Kernighan k-Opt
============================================
Structural edge improvement algorithm for the Vehicle Routing Problem.

Reference:
    Lin, S. & Kernighan, B.W. (1973). An effective heuristic algorithm for the
    traveling-salesman problem. Operations Research, 21(2), 498–516.

Implementation:
    - 2-Opt  : O(n²) per pass — used for routes ≤ 8 stops
    - 3-Opt  : O(n³) per pass — used for routes  > 8 stops
    - Sequential search: first improving swap accepted, search restarts immediately.
    - Hard time cap: 500ms per vehicle to guarantee bounded runtime.

The LK-opt procedure replaces the old TwoOptOptimizer for the post-processing
stage (TwoOptOptimizer still runs as a fast warm-start inside the solver loop).
"""
from __future__ import annotations
import time
from typing import List
from app.engine.metaheuristics.solution import RouteSolution  # type: ignore
from app.core.logger import logger  # type: ignore


class LKOptimizer:
    """
    Lin-Kernighan k-Opt for multi-vehicle routing.
    Operates on each vehicle's route independently.
    """

    #: Maximum number of improvement passes per route
    MAX_PASSES: int = 50
    #: Per-vehicle hard time limit (seconds)
    TIME_LIMIT_PER_VEHICLE: float = 0.5

    # ─── Public entry point ────────────────────────────────────────────────────
    def optimize(self, solution: RouteSolution) -> tuple[RouteSolution, float]:
        """
        Apply k-Opt to every vehicle route in `solution`.
        Returns (improved_solution, total_improvement_pct).
        """
        original_cost = solution.compute_total_cost()
        improved = solution.clone()

        for v_idx, route in enumerate(improved.routes):
            if len(route) <= 3:
                # Route has 0 or 1 customer stop — nothing to improve
                continue

            k = 3 if len(route) > 9 else 2  # auto-select k
            if k == 3:
                improved.routes[v_idx] = self._three_opt(route, improved.matrix)
            else:
                improved.routes[v_idx] = self._two_opt(route, improved.matrix)

        new_cost = improved.compute_total_cost()
        improvement_pct = 0.0
        if original_cost > 0:
            improvement_pct = round((original_cost - new_cost) / original_cost * 100, 2)

        logger.info(
            f"[LK k-Opt] Cost {original_cost:.0f} → {new_cost:.0f} "
            f"({improvement_pct:+.2f}%)"
        )
        return improved, improvement_pct

    # ─── 2-Opt ────────────────────────────────────────────────────────────────
    def _two_opt(self, route: List[int], matrix: List[List[int]]) -> List[int]:
        """
        Standard 2-Opt: try reversing every sub-segment [i..j].
        Accepts the first improving move (sequential search).
        """
        best = route[:]
        deadline = time.monotonic() + self.TIME_LIMIT_PER_VEHICLE
        n = len(best)

        for _ in range(self.MAX_PASSES):
            if time.monotonic() > deadline:
                break
            improved = False
            for i in range(1, n - 2):
                for j in range(i + 1, n - 1):
                    # Cost of existing edges: (i-1 → i) + (j → j+1)
                    d_old = (
                        matrix[best[i - 1]][best[i]]
                        + matrix[best[j]][best[j + 1]]
                    )
                    # Cost after reversing segment [i..j]: (i-1 → j) + (i → j+1)
                    d_new = (
                        matrix[best[i - 1]][best[j]]
                        + matrix[best[i]][best[j + 1]]
                    )
                    if d_new < d_old:
                        best[i : j + 1] = best[i : j + 1][::-1]
                        improved = True
                        break  # sequential search: restart after each improvement
                if improved:
                    break
            if not improved:
                break

        return best

    # ─── 3-Opt ────────────────────────────────────────────────────────────────
    def _three_opt(self, route: List[int], matrix: List[List[int]]) -> List[int]:
        """
        3-Opt: considers all triples of edges and evaluates the 7 possible
        reconnection patterns.  Accepts the first improving reconnection.

        Notation follows Lin-Kernighan (1973):
            Segment A = route[0..i], B = route[i+1..j], C = route[j+1..k], D = route[k+1..]
        """
        best = route[:]
        n = len(best)
        deadline = time.monotonic() + self.TIME_LIMIT_PER_VEHICLE

        for _ in range(self.MAX_PASSES):
            if time.monotonic() > deadline:
                break
            improved = False

            for i in range(1, n - 4):
                if time.monotonic() > deadline:
                    break
                for j in range(i + 1, n - 2):
                    for k in range(j + 1, n - 1):
                        # Current three edges
                        e1 = matrix[best[i - 1]][best[i]]
                        e2 = matrix[best[j]][best[j + 1]]
                        e3 = matrix[best[k]][best[k + 1]] if k + 1 < n else 0
                        d0 = e1 + e2 + e3  # current cost

                        # Segments
                        seg_A = best[:i]
                        seg_B = best[i : j + 1]
                        seg_C = best[j + 1 : k + 1]
                        seg_D = best[k + 1 :]

                        # Generate all reconnection candidates (7 alternatives to d0)
                        candidates = [
                            # 2-opt variants (flip one segment)
                            seg_A + seg_B[::-1] + seg_C + seg_D,
                            seg_A + seg_B + seg_C[::-1] + seg_D,
                            # 3-opt variants (mix segments)
                            seg_A + seg_C + seg_B + seg_D,
                            seg_A + seg_B[::-1] + seg_C[::-1] + seg_D,
                            seg_A + seg_C + seg_B[::-1] + seg_D,
                            seg_A + seg_C[::-1] + seg_B + seg_D,
                            seg_A + seg_C[::-1] + seg_B[::-1] + seg_D,
                        ]

                        for candidate in candidates:
                            c_e1 = matrix[candidate[i - 1]][candidate[i]]
                            c_e2 = (
                                matrix[candidate[j]][candidate[j + 1]]
                                if j + 1 < len(candidate)
                                else 0
                            )
                            c_e3 = (
                                matrix[candidate[k]][candidate[k + 1]]
                                if k + 1 < len(candidate)
                                else 0
                            )
                            if c_e1 + c_e2 + c_e3 < d0:
                                best = candidate
                                improved = True
                                break  # sequential: first improvement wins
                        if improved:
                            break
                    if improved:
                        break
            if not improved:
                break

        return best


# Module-level singleton
lk_optimizer = LKOptimizer()
