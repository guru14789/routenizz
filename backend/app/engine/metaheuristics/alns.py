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
    MAX_ITERATIONS: int = 200
    NO_IMPROVE_LIMIT: int = 50
    TIME_LIMIT: float = 2.5
    K_MIN: int = 2
    K_MAX: int = 5
    SCORE_GLOBAL_BEST: float = 3.0
    SCORE_BETTER: float = 1.5
    SCORE_ACCEPTED: float = 0.5
    WEIGHT_DECAY: float = 0.8

    def optimize(self, solution: RouteSolution, acceptance_fn=None, time_limit: float = None) -> Tuple[RouteSolution, Dict]:
        deadline = time.monotonic() + (time_limit or self.TIME_LIMIT)
        destroy_ops = [self._random_removal, self._worst_cost_removal, self._shaw_removal, self._route_removal]
        repair_ops = [self._greedy_insertion, self._regret_2_insertion]
        d_weights = [1.0] * len(destroy_ops)
        r_weights = [1.0] * len(repair_ops)
        d_scores = [0.0] * len(destroy_ops)
        r_scores = [0.0] * len(repair_ops)
        d_use = [0] * len(destroy_ops)
        r_use = [0] * len(repair_ops)

        current = solution.clone(); best = solution.clone()
        current.compute_total_cost(); best.compute_total_cost()
        no_improve = 0; accepted_worse = 0; itr = 0

        for itr in range(self.MAX_ITERATIONS):
            if time.monotonic() > deadline or no_improve >= self.NO_IMPROVE_LIMIT:
                break
            d_idx = self._roulette(d_weights); r_idx = self._roulette(r_weights)
            d_use[d_idx] += 1; r_use[r_idx] += 1

            candidate, removed = destroy_ops[d_idx](current.clone())
            candidate = repair_ops[r_idx](candidate, removed)
            candidate.compute_total_cost()

            score = 0.0
            if candidate.total_cost < best.total_cost:
                best = candidate.clone(); current = candidate.clone(); score = self.SCORE_GLOBAL_BEST; no_improve = 0
            elif candidate.total_cost < current.total_cost:
                current = candidate.clone(); score = self.SCORE_BETTER; no_improve += 1
            elif acceptance_fn and acceptance_fn(current, candidate):
                current = candidate.clone(); score = self.SCORE_ACCEPTED; accepted_worse += 1; no_improve += 1
            else:
                no_improve += 1

            d_scores[d_idx] += score; r_scores[r_idx] += score
            if itr % 20 == 0 and itr > 0:
                for i in range(len(d_weights)):
                    if d_use[i] > 0:
                        d_weights[i] = max(0.1, self.WEIGHT_DECAY * d_weights[i] + (1 - self.WEIGHT_DECAY) * d_scores[i] / d_use[i])
                for i in range(len(r_weights)):
                    if r_use[i] > 0:
                        r_weights[i] = max(0.1, self.WEIGHT_DECAY * r_weights[i] + (1 - self.WEIGHT_DECAY) * r_scores[i] / r_use[i])

        logger.info(f"[ALNS] {itr+1} iters | {solution.total_cost:.0f} → {best.total_cost:.0f} | worse-accepted: {accepted_worse}")
        return best, {"alns_iterations": itr + 1, "sa_accepted_worse": accepted_worse,
                      "destroy_weights": {f.__name__: round(d_weights[i], 3) for i, f in enumerate(destroy_ops)},
                      "repair_weights": {f.__name__: round(r_weights[i], 3) for i, f in enumerate(repair_ops)}}

    # ── Destroy operators ──────────────────────────────────────────────────────
    def _random_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = [n for r in sol.routes for n in r if n != 0]
        if not all_c: return sol, []
        to_rm = random.sample(all_c, min(k, len(all_c)))
        return self._remove_nodes(sol, to_rm), to_rm

    def _worst_cost_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        costs = []
        for route in sol.routes:
            for i, node in enumerate(route):
                if node == 0: continue
                prev_n = route[i-1] if i > 0 else 0
                next_n = route[i+1] if i+1 < len(route) else 0
                arc = sol.matrix[prev_n][node] + sol.matrix[node][next_n] - sol.matrix[prev_n][next_n]
                costs.append((node, arc))
        costs.sort(key=lambda x: x[1], reverse=True)
        to_rm = [n for n, _ in costs[:k]]
        return self._remove_nodes(sol, to_rm), to_rm

    def _shaw_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        k = random.randint(self.K_MIN, self.K_MAX)
        all_c = [n for r in sol.routes for n in r if n != 0]
        if not all_c: return sol, []
        seed = random.choice(all_c); to_rm = [seed]
        while len(to_rm) < min(k, len(all_c)):
            remaining = [n for n in all_c if n not in to_rm]
            if not remaining: break
            scored = sorted(remaining, key=lambda n: min(sol.matrix[n][r] for r in to_rm))
            pool = max(1, len(scored) // 3)
            to_rm.append(random.choice(scored[:pool]))
        return self._remove_nodes(sol, to_rm), to_rm

    def _route_removal(self, sol: RouteSolution) -> Tuple[RouteSolution, List[int]]:
        if not sol.routes: return sol, []
        idx = min(range(len(sol.routes)), key=lambda i: sum(1 for n in sol.routes[i] if n != 0))
        to_rm = [n for n in sol.routes[idx] if n != 0]
        sol.routes[idx] = [0, 0]
        return sol, to_rm

    # ── Repair operators ───────────────────────────────────────────────────────
    def _greedy_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        random.shuffle(removed)
        for node in removed:
            best_cost = float("inf"); best_v = -1; best_pos = -1
            for v_idx, route in enumerate(sol.routes):
                if v_idx >= len(sol.vehicles) or not self._can_insert(sol, v_idx, node): continue
                for pos in range(1, len(route)):
                    prev_n = route[pos-1]; next_n = route[pos]
                    delta = sol.matrix[prev_n][node] + sol.matrix[node][next_n] - sol.matrix[prev_n][next_n]
                    if delta < best_cost:
                        best_cost = delta; best_v = v_idx; best_pos = pos
            if best_v >= 0: sol.routes[best_v].insert(best_pos, node)
            else: self._force_insert(sol, node)
        return sol

    def _regret_2_insertion(self, sol: RouteSolution, removed: List[int]) -> RouteSolution:
        uninserted = list(removed)
        while uninserted:
            regrets = []
            for node in uninserted:
                positions = []
                for v_idx, route in enumerate(sol.routes):
                    if v_idx >= len(sol.vehicles) or not self._can_insert(sol, v_idx, node): continue
                    for pos in range(1, len(route)):
                        prev_n = route[pos-1]; next_n = route[pos]
                        delta = sol.matrix[prev_n][node] + sol.matrix[node][next_n] - sol.matrix[prev_n][next_n]
                        positions.append((delta, v_idx, pos))
                if not positions: continue
                positions.sort(key=lambda x: x[0])
                regret = (positions[1][0] - positions[0][0]) if len(positions) > 1 else 0
                regrets.append((regret, node, positions[0][1], positions[0][2]))
            if not regrets:
                for n in uninserted: self._force_insert(sol, n)
                break
            regrets.sort(key=lambda x: x[0], reverse=True)
            _, chosen, bv, bp = regrets[0]
            sol.routes[bv].insert(bp, chosen)
            uninserted.remove(chosen)
        return sol

    # ── Helpers ────────────────────────────────────────────────────────────────
    @staticmethod
    def _roulette(weights: List[float]) -> int:
        total = sum(weights)
        if total <= 0: return random.randrange(len(weights))
        r = random.uniform(0, total); cumulative = 0.0
        for i, w in enumerate(weights):
            cumulative += w
            if r <= cumulative: return i
        return len(weights) - 1

    @staticmethod
    def _remove_nodes(sol: RouteSolution, nodes: List[int]) -> RouteSolution:
        ns = set(nodes)
        for v_idx in range(len(sol.routes)):
            sol.routes[v_idx] = [n for n in sol.routes[v_idx] if n not in ns]
            if not sol.routes[v_idx]: sol.routes[v_idx] = [0, 0]
            if sol.routes[v_idx][0] != 0: sol.routes[v_idx].insert(0, 0)
            if sol.routes[v_idx][-1] != 0: sol.routes[v_idx].append(0)
        return sol

    def _can_insert(self, sol: RouteSolution, v_idx: int, node: int) -> bool:
        cap = int(float(sol.vehicles[v_idx].get("capacity", 100)))
        load = sol.route_demand(sol.routes[v_idx])
        demand = int(sol.stops[node-1].get("demand_units", 1)) if node > 0 else 0
        return load + demand <= cap

    def _force_insert(self, sol: RouteSolution, node: int) -> None:
        best_v = min(range(len(sol.vehicles)), key=lambda i: sol.route_demand(sol.routes[i]))
        route = sol.routes[best_v]
        route.insert(max(1, len(route) - 1), node)


alns_optimizer = ALNSOptimizer()
