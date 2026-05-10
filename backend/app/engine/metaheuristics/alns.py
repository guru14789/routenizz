"""
ORION-ELITE: ALNS — Adaptive Large-Neighborhood Search
Destroy-and-repair with 4 destroy operators, 2 repair operators,
and adaptive roulette-wheel weight updates.
"""
from __future__ import annotations
import random, time
from typing import List, Tuple, Dict
from app.engine.metaheuristics.solution import RouteSolution  # type: ignore
from app.core.logger import logger  # type: ignore
class ALNSOptimizer:
    MAX_ITERATIONS: int = 300
    NO_IMPROVE_LIMIT: int = 100
    TIME_LIMIT: float = 2.5
    K_MIN: int = 2
    K_MAX: int = 8
    SCORE_GLOBAL_BEST: float = 10.0
    SCORE_BETTER: float = 5.0
    SCORE_ACCEPTED: float = 2.0
    WEIGHT_DECAY: float = 0.8

    def __init__(self):
        self.edge_costs_history: Dict[Tuple[int, int], float] = {}

    def optimize(self, solution: RouteSolution, acceptance_fn=None, time_limit: float = None) -> Tuple[RouteSolution, Dict]:
        deadline = time.monotonic() + (time_limit or self.TIME_LIMIT)
        
        destroy_ops = [
            self._random_removal, 
            self._worst_cost_removal, 
            self._shaw_removal, 
            self._route_removal,
            self._cluster_removal,
            self._historical_removal
        ]
        repair_ops = [
            self._greedy_insertion, 
            self._regret_2_insertion,
            self._regret_3_insertion,
            self._greedy_noise_insertion
        ]
        
        d_weights = [1.0] * len(destroy_ops)
        r_weights = [1.0] * len(repair_ops)
        d_scores = [0.0] * len(destroy_ops)
        r_scores = [0.0] * len(repair_ops)
        d_use = [0] * len(destroy_ops)
        r_use = [0] * len(repair_ops)

        current = solution.clone(); best = solution.clone()
        current.compute_total_cost(); best.compute_total_cost()
        no_improve = 0; accepted_worse = 0; itr = 0

        while itr < self.MAX_ITERATIONS:
            if time.monotonic() > deadline or no_improve >= self.NO_IMPROVE_LIMIT:
                break
            
            d_idx = self._roulette(d_weights); r_idx = self._roulette(r_weights)
            d_use[d_idx] += 1; r_use[r_idx] += 1

            candidate, removed = destroy_ops[d_idx](current.clone())
            candidate = repair_ops[r_idx](candidate, removed)
            candidate.compute_total_cost()

            score = 0.0
            if candidate.total_cost < best.total_cost - 0.1:
                best = candidate.clone(); current = candidate.clone(); score = self.SCORE_GLOBAL_BEST; no_improve = 0
            elif candidate.total_cost < current.total_cost - 0.1:
                current = candidate.clone(); score = self.SCORE_BETTER; no_improve += 1
            elif acceptance_fn and acceptance_fn(current, candidate):
                current = candidate.clone(); score = self.SCORE_ACCEPTED; accepted_worse += 1; no_improve += 1
            else:
                no_improve += 1

            d_scores[d_idx] += score; r_scores[r_idx] += score
            
            # Update history for historical removal
            self._update_history(current)
            
            if itr % 20 == 0 and itr > 0:
                for i in range(len(d_weights)):
                    if d_use[i] > 0:
                        d_weights[i] = self.WEIGHT_DECAY * d_weights[i] + (1 - self.WEIGHT_DECAY) * d_scores[i] / d_use[i]
                for i in range(len(r_weights)):
                    if r_use[i] > 0:
                        r_weights[i] = self.WEIGHT_DECAY * r_weights[i] + (1 - self.WEIGHT_DECAY) * r_scores[i] / r_use[i]
            itr += 1

        logger.info(f"[ALNS] {itr} iters | {solution.total_cost:.0f} → {best.total_cost:.0f} | worse-accepted: {accepted_worse}")
        return best, {
            "alns_iterations": itr, 
            "sa_accepted_worse": accepted_worse,
            "destroy_weights": {f.__name__: round(d_weights[i], 3) for i, f in enumerate(destroy_ops)},
            "repair_weights": {f.__name__: round(r_weights[i], 3) for i, f in enumerate(repair_ops)}
        }

    # ── Destroy operators ──────────────────────────────────────────────────────
    def _random_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = sol.get_all_customers()
        if not all_c: return sol, []
        to_rm = random.sample(all_c, min(k, len(all_c)))
        return self._remove_nodes(sol, to_rm), to_rm

    def _worst_cost_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        costs = []
        for route in sol.routes:
            for i in range(1, len(route) - 1):
                node = route[i]
                prev_n, next_n = route[i-1], route[i+1]
                savings = sol.matrix[prev_n][node] + sol.matrix[node][next_n] - sol.matrix[prev_n][next_n]
                costs.append((node, savings))
        costs.sort(key=lambda x: x[1], reverse=True)
        to_rm = [n for n, _ in costs[:k]]
        return self._remove_nodes(sol, to_rm), to_rm

    def _shaw_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = sol.get_all_customers()
        if not all_c: return sol, []
        
        seed = random.choice(all_c); to_rm = [seed]
        while len(to_rm) < min(k, len(all_c)):
            target = random.choice(to_rm)
            # Relatedness: distance + demand difference
            remaining = [n for n in all_c if n not in to_rm]
            scored = sorted(remaining, key=lambda n: self._relatedness(sol, target, n))
            # Randomized selection from top candidates
            idx = int(random.random()**3 * len(scored))
            to_rm.append(scored[idx])
            
        return self._remove_nodes(sol, to_rm), to_rm

    def _route_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        active_routes = [i for i, r in enumerate(sol.routes) if len(r) > 2]
        if not active_routes: return sol, []
        idx = random.choice(active_routes)
        to_rm = [n for n in sol.routes[idx] if n != 0]
        sol.routes[idx] = [0, 0]
        return sol, to_rm

    def _cluster_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        """Removes nodes belonging to a geographic cluster."""
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = sol.get_all_customers()
        if not all_c: return sol, []
        
        seed = random.choice(all_c)
        to_rm = sorted(all_c, key=lambda n: sol.matrix[seed][n])[:k]
        return self._remove_nodes(sol, to_rm), to_rm

    def _historical_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        """Removes nodes based on edge costs history."""
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = sol.get_all_customers()
        if not all_c: return sol, []
        
        scored = []
        for n in all_c:
            # Simple average of historical edge costs involving this node
            edges = [cost for (u, v), cost in self.edge_costs_history.items() if u == n or v == n]
            avg_cost = sum(edges) / len(edges) if edges else 0
            scored.append((n, avg_cost))
        
        scored.sort(key=lambda x: x[1], reverse=True)
        to_rm = [n for n, _ in scored[:k]]
        return self._remove_nodes(sol, to_rm), to_rm

    # ── Repair operators ───────────────────────────────────────────────────────
    def _greedy_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        return self._insert_best(sol, removed, noise=0.0)

    def _greedy_noise_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        return self._insert_best(sol, removed, noise=0.2)

    def _regret_2_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        return self._regret_n_insertion(sol, removed, n_regret=2)

    def _regret_3_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        return self._regret_n_insertion(sol, removed, n_regret=3)

    # ── Logic Implementations ──────────────────────────────────────────────────
    def _insert_best(self, sol: RouteSolution, removed: List[int], noise: float = 0.0) -> RouteSolution:
        random.shuffle(removed)
        for node in removed:
            best_val = float("inf"); best_v = -1; best_pos = -1
            for v_idx, route in enumerate(sol.routes):
                if not self._can_insert(sol, v_idx, node): continue
                for pos in range(1, len(route)):
                    cost = self._calc_insertion_cost(sol, node, route[pos-1], route[pos])
                    if noise > 0: cost *= (1 + (random.random() - 0.5) * noise)
                    if cost < best_val:
                        best_val = cost; best_v = v_idx; best_pos = pos
            if best_v >= 0: sol.routes[best_v].insert(best_pos, node)
            else: self._force_insert(sol, node)
        return sol

    def _regret_n_insertion(self, sol: RouteSolution, removed: List[int], n_regret: int) -> RouteSolution:
        uninserted = list(removed)
        while uninserted:
            best_regret = -1.0; best_node = -1; best_v = -1; best_pos = -1
            for node in uninserted:
                options = []
                for v_idx, route in enumerate(sol.routes):
                    if not self._can_insert(sol, v_idx, node): continue
                    for pos in range(1, len(route)):
                        cost = self._calc_insertion_cost(sol, node, route[pos-1], route[pos])
                        options.append((cost, v_idx, pos))
                
                if not options: continue
                options.sort(key=lambda x: x[0])
                
                # Calculate regret: sum of differences between best and next n-1 best
                regret = 0.0
                limit = min(n_regret, len(options))
                for i in range(1, limit):
                    regret += (options[i][0] - options[0][0])
                
                if regret > best_regret:
                    best_regret = regret; best_node = node; best_v = options[0][1]; best_pos = options[0][2]
            
            if best_node == -1:
                for n in uninserted: self._force_insert(sol, n)
                break
            
            sol.routes[best_v].insert(best_pos, best_node)
            uninserted.remove(best_node)
        return sol

    # ── Helpers ────────────────────────────────────────────────────────────────
    def _relatedness(self, sol: RouteSolution, i: int, j: int) -> float:
        """
        Shaw relatedness: lower value = more related (similar demand, close spatial distance).
        BUG FIX: stops list is 0-indexed but node IDs start at 1 (depot=0).
        Use direct indexing: stop for node i is at sol.stops[i], where node 0 = depot is virtual.
        Guard against out-of-range accesses.
        """
        max_idx = len(sol.stops) - 1
        i_idx = min(i, max_idx)
        j_idx = min(j, max_idx)
        d_i = int(sol.stops[i_idx].get("demand_units", 1))
        d_j = int(sol.stops[j_idx].get("demand_units", 1))
        return sol.matrix[i][j] + 10 * abs(d_i - d_j)

    def _calc_insertion_cost(self, sol: RouteSolution, n: int, u: int, v: int) -> float:
        return sol.matrix[u][n] + sol.matrix[n][v] - sol.matrix[u][v]

    def _update_history(self, sol: RouteSolution) -> None:
        for route in sol.routes:
            for i in range(len(route) - 1):
                u, v = route[i], route[i+1]
                self.edge_costs_history[(u, v)] = float(sol.matrix[u][v])

    @staticmethod
    def _roulette(weights: List[float]) -> int:
        total = sum(weights)
        if total <= 0: return random.randrange(len(weights))
        r = random.uniform(0, total); acc = 0.0
        for i, w in enumerate(weights):
            acc += w
            if r <= acc: return i
        return len(weights) - 1

    @staticmethod
    def _remove_nodes(sol: RouteSolution, nodes: List[int]) -> RouteSolution:
        ns = set(nodes)
        for i in range(len(sol.routes)):
            sol.routes[i] = [n for n in sol.routes[i] if n not in ns]
            if len(sol.routes[i]) < 2: sol.routes[i] = [0, 0]
            if sol.routes[i][0] != 0: sol.routes[i].insert(0, 0)
            if sol.routes[i][-1] != 0: sol.routes[i].append(0)
        return sol

    def _can_insert(self, sol: RouteSolution, v_idx: int, node: int) -> bool:
        if v_idx >= len(sol.vehicles): return False
        cap = int(float(sol.vehicles[v_idx].get("capacity", 100)))
        load = sol.route_demand(sol.routes[v_idx])
        demand = int(sol.stops[node-1].get("demand_units", 1)) if node > 0 else 0
        return load + demand <= cap

    def _force_insert(self, sol: RouteSolution, node: int) -> None:
        """
        Insert a node into the vehicle with the MOST remaining capacity.
        BUG FIX: previously used min(route_demand) which picks the vehicle carrying
        the fewest items — not necessarily the one with the most free space.
        Remaining capacity = vehicle.capacity - route_demand.
        """
        best_v = 0
        best_remaining = -1.0
        for v_idx, vehicle in enumerate(sol.vehicles):
            cap = float(vehicle.get("capacity", 100))
            load = float(sol.route_demand(sol.routes[v_idx]))
            remaining = cap - load
            if remaining > best_remaining:
                best_remaining = remaining
                best_v = v_idx
        route = sol.routes[best_v]
        route.insert(max(1, len(route) - 1), node)

alns_optimizer = ALNSOptimizer()
