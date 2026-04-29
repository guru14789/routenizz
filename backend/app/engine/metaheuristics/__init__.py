"""
ORION-ELITE: Metaheuristics & Local Search Engine
==================================================
Post-processing improvement pipeline applied on top of the OR-Tools VRP solution.

Pipeline stages (in order):
  1. Lin-Kernighan k-Opt   — structural edge rewiring (fast, per-vehicle)
  2. ALNS                  — adaptive large-neighborhood destroy-and-repair
  3. Simulated Annealing   — stochastic acceptance to escape local optima
  4. Lagrangian Relaxation — lower bound computation & constraint guidance

Usage:
    from app.engine.metaheuristics import MetaheuristicPipeline

    pipeline = MetaheuristicPipeline(matrix=matrix, stops=stops, vehicles=vehicles)
    refined_plans, stats = pipeline.run(all_plans, time_limit_sec=3.0)
"""

from app.engine.metaheuristics.pipeline import MetaheuristicPipeline  # type: ignore

__all__ = ["MetaheuristicPipeline"]
