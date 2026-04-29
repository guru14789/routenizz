"""
ORION-ELITE: Metaheuristic Pipeline Orchestrator
=================================================
Runs all four stages in sequence on an OR-Tools solution.

    Stage 1 — Lin-Kernighan k-Opt         (per-vehicle structural improvement)
    Stage 2 — ALNS + Stage 3 SA combined  (destroy-repair with SA acceptance)
    Stage 4 — Lagrangian Relaxation       (lower bound + gap reporting)

Returns the refined route plans and a `metaheuristic_stats` dict for the API.
"""
from __future__ import annotations
import time
from typing import List, Dict, Any, Tuple
from app.engine.metaheuristics.solution import RouteSolution  # type: ignore
from app.engine.metaheuristics.lk_kopt import lk_optimizer  # type: ignore
from app.engine.metaheuristics.alns import alns_optimizer  # type: ignore
from app.engine.metaheuristics.simulated_annealing import simulated_annealing  # type: ignore
from app.engine.metaheuristics.lagrangian import lagrangian_relaxation  # type: ignore
from app.core.logger import logger  # type: ignore


class MetaheuristicPipeline:
    """
    Entry point for the four-stage metaheuristic improvement pipeline.

    Usage:
        pipeline = MetaheuristicPipeline(matrix, stops, vehicles)
        refined_plans, stats = pipeline.run(all_plans, time_limit_sec=3.0)

    Args:
        matrix   — NxN integer travel-time matrix (seconds)
        stops    — list of stop dicts (0-indexed; stop i → node index i+1)
        vehicles — list of vehicle dicts
    """

    def __init__(
        self,
        matrix: List[List[int]],
        stops: List[Dict[str, Any]],
        vehicles: List[Dict[str, Any]],
    ):
        self.matrix = matrix
        self.stops = stops
        self.vehicles = vehicles

    def run(
        self,
        all_plans: List[List[int]],
        time_limit_sec: float = 3.0,
    ) -> Tuple[List[List[int]], Dict[str, Any]]:
        """
        Improve route plans using the four-stage metaheuristic pipeline.

        Args:
            all_plans      — list of node sequences (one per vehicle, from OR-Tools)
            time_limit_sec — hard wall for the entire pipeline (default 3s)

        Returns:
            (refined_plans, metaheuristic_stats)
        """
        pipeline_start = time.monotonic()
        stats: Dict[str, Any] = {}

        # ── Build shared solution object ──────────────────────────────────────
        solution = RouteSolution(
            routes=all_plans,
            matrix=self.matrix,
            stops=self.stops,
            vehicles=self.vehicles,
        )
        solution.compute_total_cost()
        initial_cost = solution.total_cost

        logger.info(
            f"[Pipeline] Starting | cost={initial_cost:.0f} | "
            f"vehicles={len(all_plans)} | time_budget={time_limit_sec}s"
        )

        remaining = lambda: time_limit_sec - (time.monotonic() - pipeline_start)

        # ── Stage 1: Lin-Kernighan k-Opt ──────────────────────────────────────
        try:
            if remaining() > 0.3:
                solution, lk_pct = lk_optimizer.optimize(solution)
                stats["lk_improvement_pct"] = lk_pct
            else:
                stats["lk_improvement_pct"] = 0.0
        except Exception as e:
            logger.warning(f"[Pipeline] LK-Opt skipped: {e}")
            stats["lk_improvement_pct"] = 0.0

        # ── Stages 2+3: ALNS driven by Simulated Annealing acceptance ─────────
        try:
            if remaining() > 0.5:
                sa_time = min(remaining() - 0.3, 2.5)  # leave 0.3s for LR
                iteration_counter = [0]
                acceptance_fn = simulated_annealing.build_acceptance_fn(iteration_counter)
                solution, alns_stats = alns_optimizer.optimize(
                    solution,
                    acceptance_fn=acceptance_fn,
                    time_limit=sa_time,
                )
                # Compute final SA temperature
                n_iters = alns_stats.get("alns_iterations", 1)
                final_T = max(
                    simulated_annealing.T_END,
                    simulated_annealing.T_START * (simulated_annealing.ALPHA ** n_iters),
                )
                alns_stats["sa_final_temperature"] = round(final_T, 2)
                stats.update(alns_stats)
            else:
                stats.setdefault("alns_iterations", 0)
                stats.setdefault("sa_accepted_worse", 0)
                stats.setdefault("sa_final_temperature", simulated_annealing.T_START)
        except Exception as e:
            logger.warning(f"[Pipeline] ALNS+SA skipped: {e}")
            stats.setdefault("alns_iterations", 0)
            stats.setdefault("sa_accepted_worse", 0)

        # ── Stage 4: Lagrangian Relaxation ────────────────────────────────────
        try:
            if remaining() > 0.05:
                lb, lr_stats = lagrangian_relaxation.compute_lower_bound(solution)
                stats.update(lr_stats)
            else:
                stats["lagrangian_bound"] = 0.0
                stats["optimality_gap_pct"] = None
        except Exception as e:
            logger.warning(f"[Pipeline] Lagrangian Relaxation skipped: {e}")
            stats["lagrangian_bound"] = 0.0
            stats["optimality_gap_pct"] = None

        # ── Summary ───────────────────────────────────────────────────────────
        final_cost = solution.compute_total_cost()
        total_elapsed = round(time.monotonic() - pipeline_start, 3)
        total_improvement = 0.0
        if initial_cost > 0:
            total_improvement = round((initial_cost - final_cost) / initial_cost * 100, 2)

        stats["pipeline_elapsed_sec"] = total_elapsed
        stats["total_improvement_pct"] = total_improvement

        logger.info(
            f"[Pipeline] Done | cost {initial_cost:.0f} → {final_cost:.0f} "
            f"({total_improvement:+.2f}%) | {total_elapsed}s elapsed | "
            f"gap={stats.get('optimality_gap_pct', 'N/A')}%"
        )

        return solution.routes, stats
