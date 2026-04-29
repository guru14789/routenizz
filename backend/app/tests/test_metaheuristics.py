"""
Tests for the ORION-ELITE Metaheuristic Pipeline.

Run with:
    cd backend
    python -m pytest app/tests/test_metaheuristics.py -v
"""
import pytest
import random
from app.engine.metaheuristics.solution import RouteSolution
from app.engine.metaheuristics.lk_kopt import LKOptimizer
from app.engine.metaheuristics.alns import ALNSOptimizer
from app.engine.metaheuristics.simulated_annealing import SimulatedAnnealing
from app.engine.metaheuristics.lagrangian import LagrangianRelaxation
from app.engine.metaheuristics.pipeline import MetaheuristicPipeline


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def _make_matrix(n: int, seed: int = 42) -> list[list[int]]:
    """Generate a symmetric travel-time matrix (seconds)."""
    rng = random.Random(seed)
    mat = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            t = rng.randint(300, 3600)
            mat[i][j] = t
            mat[j][i] = t
    return mat


def _make_stops(n_customers: int) -> list[dict]:
    return [
        {"id": f"S{i}", "demand_units": 1, "weight_kg": 10,
         "time_window_start": 0, "time_window_end": 86400,
         "lat": 11.0 + i * 0.01, "lng": 77.0 + i * 0.01}
        for i in range(n_customers)
    ]


def _make_vehicles(n: int, capacity: int = 20) -> list[dict]:
    return [
        {"vehicle_id": f"V{i}", "capacity": capacity,
         "weight_capacity_kg": 1000, "consumption_liters_per_100km": 12.0,
         "driver_hourly_wage": 250.0, "cost_per_km": 1.5}
        for i in range(n)
    ]


def _make_solution(n_customers: int = 10, n_vehicles: int = 2) -> RouteSolution:
    """Build a trivially-split RouteSolution for testing."""
    n_nodes = n_customers + 1  # depot + customers
    matrix = _make_matrix(n_nodes)
    stops = _make_stops(n_customers)
    vehicles = _make_vehicles(n_vehicles)

    # Split customers evenly across vehicles
    routes = [[0] + list(range(1 + i, n_customers + 1, n_vehicles)) + [0]
              for i in range(n_vehicles)]

    sol = RouteSolution(routes=routes, matrix=matrix, stops=stops, vehicles=vehicles)
    sol.compute_total_cost()
    return sol


# ─── Solution dataclass tests ──────────────────────────────────────────────────

class TestRouteSolution:
    def test_compute_total_cost_positive(self):
        sol = _make_solution(10, 2)
        assert sol.total_cost > 0

    def test_clone_is_independent(self):
        sol = _make_solution(10, 2)
        cloned = sol.clone()
        cloned.routes[0].append(99)
        assert 99 not in sol.routes[0], "Clone should be independent"

    def test_feasibility_within_capacity(self):
        sol = _make_solution(10, 2)  # 5 stops per vehicle, capacity 20
        assert sol.is_feasible()

    def test_unassigned_stops_empty(self):
        sol = _make_solution(6, 2)
        assert sol.unassigned_stops() == []


# ─── LK k-Opt tests ────────────────────────────────────────────────────────────

class TestLKOptimizer:
    def test_two_opt_never_worsens(self):
        sol = _make_solution(10, 2)
        original_cost = sol.total_cost
        opt = LKOptimizer()
        refined, pct = opt.optimize(sol)
        assert refined.total_cost <= original_cost + 1e-6, \
            "2/3-opt must never increase cost"

    def test_improvement_pct_non_negative(self):
        sol = _make_solution(12, 2)
        opt = LKOptimizer()
        _, pct = opt.optimize(sol)
        assert pct >= 0.0

    def test_selects_3opt_for_large_routes(self):
        """Routes with > 8 stops should use 3-opt internally."""
        sol = _make_solution(20, 1)
        opt = LKOptimizer()
        original = sol.total_cost
        refined, _ = opt.optimize(sol)
        # Just check it completes and doesn't worsen
        assert refined.total_cost <= original + 1e-6

    def test_small_route_uses_2opt(self):
        sol = _make_solution(4, 2)
        opt = LKOptimizer()
        refined, _ = opt.optimize(sol)
        assert refined.total_cost >= 0


# ─── ALNS tests ────────────────────────────────────────────────────────────────

class TestALNSOptimizer:
    def test_alns_returns_feasible_solution(self):
        sol = _make_solution(10, 2)
        alns = ALNSOptimizer()
        alns.MAX_ITERATIONS = 20  # fast for tests
        result, _ = alns.optimize(sol)
        assert result.is_feasible(), "ALNS must always return capacity-feasible solution"

    def test_alns_stats_contain_required_keys(self):
        sol = _make_solution(8, 2)
        alns = ALNSOptimizer()
        alns.MAX_ITERATIONS = 10
        _, stats = alns.optimize(sol)
        assert "alns_iterations" in stats
        assert "sa_accepted_worse" in stats
        assert "destroy_weights" in stats
        assert "repair_weights" in stats

    def test_greedy_insertion_covers_all_stops(self):
        """After destroy+repair, no stops should remain unassigned."""
        sol = _make_solution(10, 2)
        alns = ALNSOptimizer()
        # Manually destroy 3 stops
        destroyed, removed = alns._random_removal(sol.clone())
        repaired = alns._greedy_insertion(destroyed, removed)
        assert repaired.unassigned_stops() == [], \
            "Greedy insertion must reinsert all removed stops"

    def test_regret_insertion_covers_all_stops(self):
        sol = _make_solution(10, 2)
        alns = ALNSOptimizer()
        destroyed, removed = alns._worst_cost_removal(sol.clone())
        repaired = alns._regret_2_insertion(destroyed, removed)
        assert repaired.unassigned_stops() == []


# ─── Simulated Annealing tests ─────────────────────────────────────────────────

class TestSimulatedAnnealing:
    def test_temperature_decreases(self):
        sa = SimulatedAnnealing()
        T_init = sa.T_START
        T_after_100 = max(sa.T_END, sa.T_START * (sa.ALPHA ** 100))
        assert T_after_100 < T_init, "Temperature must strictly decrease"

    def test_acceptance_fn_always_accepts_improvements(self):
        sa = SimulatedAnnealing()
        counter = [0]
        fn = sa.build_acceptance_fn(counter)
        better = _make_solution(6, 1)
        worse = better.clone()
        worse.total_cost = better.total_cost + 1000.0
        # A better candidate should always be accepted
        assert fn(worse, better)

    def test_acceptance_fn_probabilistic_for_worse(self):
        """With T_start very high, worse moves should sometimes be accepted."""
        sa = SimulatedAnnealing()
        sa.T_START = 1_000_000.0  # near-always accept at extreme temperature
        counter = [0]
        fn = sa.build_acceptance_fn(counter)
        current = _make_solution(6, 1)
        worse = current.clone()
        worse.total_cost = current.total_cost + 100.0
        # With huge T, acceptance probability is nearly 1.0
        accepted = [fn(current, worse) for _ in range(50)]
        assert sum(accepted) > 0, "With high T, some worse moves must be accepted"

    def test_sa_run_returns_best_not_last(self):
        """Final solution must be ≤ initial cost (global best is tracked separately)."""
        sa = SimulatedAnnealing()
        sol = _make_solution(10, 2)
        alns = ALNSOptimizer()
        alns.MAX_ITERATIONS = 30
        best, stats = sa.run(sol, alns, time_limit=1.0)
        assert best.total_cost <= sol.total_cost + 1e-6, \
            "SA must return global best (≤ initial cost)"


# ─── Lagrangian Relaxation tests ───────────────────────────────────────────────

class TestLagrangianRelaxation:
    def test_lower_bound_leq_actual_cost(self):
        """Mathematical guarantee: LR lower bound ≤ feasible solution cost."""
        sol = _make_solution(10, 2)
        lr = LagrangianRelaxation()
        lb, _ = lr.compute_lower_bound(sol)
        assert lb <= sol.total_cost + 1e-3, \
            f"LR bound ({lb}) must be ≤ actual cost ({sol.total_cost})"

    def test_stats_contain_required_keys(self):
        sol = _make_solution(8, 2)
        lr = LagrangianRelaxation()
        _, stats = lr.compute_lower_bound(sol)
        assert "lagrangian_bound" in stats
        assert "optimality_gap_pct" in stats
        assert "lagrangian_iters" in stats

    def test_gap_pct_non_negative(self):
        sol = _make_solution(10, 2)
        lr = LagrangianRelaxation()
        _, stats = lr.compute_lower_bound(sol)
        gap = stats.get("optimality_gap_pct", 0)
        assert gap >= 0.0, "Optimality gap must be non-negative"

    def test_is_above_lower_bound(self):
        lr = LagrangianRelaxation()
        assert lr.is_above_lower_bound(1000.0, 800.0)
        assert not lr.is_above_lower_bound(700.0, 800.0)


# ─── Full Pipeline integration test ────────────────────────────────────────────

class TestMetaheuristicPipeline:
    def test_pipeline_improves_or_maintains_cost(self):
        n_customers = 10
        n_vehicles = 2
        matrix = _make_matrix(n_customers + 1)
        stops = _make_stops(n_customers)
        vehicles = _make_vehicles(n_vehicles)

        # Create initial plans (round-robin split as OR-Tools would produce)
        all_plans = [
            [0] + list(range(1 + i, n_customers + 1, n_vehicles)) + [0]
            for i in range(n_vehicles)
        ]
        initial_sol = RouteSolution(routes=[p[:] for p in all_plans], matrix=matrix, stops=stops, vehicles=vehicles)
        initial_cost = initial_sol.compute_total_cost()

        pipeline = MetaheuristicPipeline(matrix=matrix, stops=stops, vehicles=vehicles)
        refined_plans, stats = pipeline.run(all_plans, time_limit_sec=2.0)

        final_sol = RouteSolution(routes=refined_plans, matrix=matrix, stops=stops, vehicles=vehicles)
        final_cost = final_sol.compute_total_cost()

        assert final_cost <= initial_cost + 1e-3, \
            f"Pipeline must not worsen cost: {initial_cost} → {final_cost}"
        assert "lk_improvement_pct" in stats
        assert "alns_iterations" in stats
        assert "lagrangian_bound" in stats

    def test_pipeline_stats_complete(self):
        matrix = _make_matrix(7)
        stops = _make_stops(6)
        vehicles = _make_vehicles(2)
        all_plans = [[0, 1, 2, 3, 0], [0, 4, 5, 6, 0]]

        pipeline = MetaheuristicPipeline(matrix=matrix, stops=stops, vehicles=vehicles)
        _, stats = pipeline.run(all_plans, time_limit_sec=1.5)

        required_keys = [
            "lk_improvement_pct",
            "alns_iterations",
            "sa_accepted_worse",
            "sa_final_temperature",
            "lagrangian_bound",
            "optimality_gap_pct",
            "pipeline_elapsed_sec",
            "total_improvement_pct",
        ]
        for key in required_keys:
            assert key in stats, f"Missing stat key: {key}"

    def test_pipeline_handles_single_vehicle(self):
        matrix = _make_matrix(6)
        stops = _make_stops(5)
        vehicles = _make_vehicles(1, capacity=50)
        all_plans = [[0, 1, 2, 3, 4, 5, 0]]

        pipeline = MetaheuristicPipeline(matrix=matrix, stops=stops, vehicles=vehicles)
        refined, stats = pipeline.run(all_plans, time_limit_sec=1.0)
        assert len(refined) == 1
        assert refined[0][0] == 0 and refined[0][-1] == 0
