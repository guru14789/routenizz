/**
 * USES: Frontend route optimization logic.
 * SUPPORT: Implements a hybrid approach (Nearest Neighbor + 2-opt) for local optimization and acts as the client for the backend Enterprise VRP solver.
 */
import { predictTravelTime } from './predictor.js';
import { calculateFuel } from './fuelCalculator.js';
import { calculateCost } from './costFunction.js';
import { applyTwoOpt } from './localSearch.js';
import { fetchTrafficMultiplier } from './trafficClient.js';
import { API_ROUTES } from '../config.js';

/**
 * HYBRID ROUTE OPTIMIZATION ARCHITECTURE
 * 
 * This module follows a three-stage approach:
 * 1. Construction (Nearest Neighbor): Build a valid initial route.
 * 2. Refinement (2-opt): Improve the route by swapping segments.
 * 3. Validation: Recalculate finals and arrival times.
 */

/**
 * Stage 0: Geometric Utilities
 * Calculates the straight-line distance between two coordinates using Haversine formula.
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Stage 1: Constraint Validation
 * Calculates the delay penalty for a specific segment.
 * Includes a fixed penalty for missing time windows.
 */
export const validateConstraints = (predictedArrivalTime, timeWindowEnd, latePenalty) => {
    let delayPenalty = Math.max(0, predictedArrivalTime - timeWindowEnd);

    // Hard Constraint: Penalty for being late
    if (predictedArrivalTime > timeWindowEnd) {
        delayPenalty += latePenalty;
    }

    return delayPenalty;
};

/**
 * Stage 2: Initial Construction (Nearest Neighbor)
 * Rapidly builds a starting route by picking the "cheapest" next stop.
 */
export const buildInitialRoute = async (startPoint, stops, config) => {
    let currentPos = { lat: startPoint.lat, lng: startPoint.lng };
    let pendingStops = [...stops];
    let route = [];
    let currentTime = 0;

    while (pendingStops.length > 0) {
        let bestStopIndex = -1;
        let lowestStopCost = Infinity;

        for (let i = 0; i < pendingStops.length; i++) {
            const stop = pendingStops[i];
            const dist = calculateDistance(currentPos.lat, currentPos.lng, stop.lat, stop.lng);

            // ML-based traffic prediction or static override
            const trafficMult = config.staticTrafficMultiplier || await fetchTrafficMultiplier(dist, stop.roadType || 0);

            const time = predictTravelTime(dist, trafficMult, config.baseSpeed);
            const fuel = calculateFuel(dist, trafficMult, config.vehicleConsumptionRate);

            const penalty = validateConstraints(currentTime + time, stop.timeWindowEnd, config.latePenalty);
            const cost = calculateCost(time, fuel, penalty, config);

            if (cost < lowestStopCost) {
                lowestStopCost = cost;
                bestStopIndex = i;
            }
        }

        const chosenStop = pendingStops.splice(bestStopIndex, 1)[0];
        route.push(chosenStop);

        const dist = calculateDistance(currentPos.lat, currentPos.lng, chosenStop.lat, chosenStop.lng);
        const trafficMult = config.staticTrafficMultiplier || await fetchTrafficMultiplier(dist, chosenStop.roadType || 0);
        currentTime += predictTravelTime(dist, trafficMult, config.baseSpeed);
        currentPos = { lat: chosenStop.lat, lng: chosenStop.lng };
    }

    return route;
};

/**
 * Stage 3: Local Improvement (2-opt)
 * Refines the constructed route to eliminate inefficiencies.
 */
export const applyLocalImprovement = async (startPoint, initialRoute, config) => {
    return applyTwoOpt(initialRoute, async (testRoute) => {
        // Evaluation function for local search
        const metrics = await calculateFinalMetrics(startPoint, testRoute, config);
        return metrics.totalCost;
    });
};

/**
 * Internal helper to calculate final route statistics.
 */
const calculateFinalMetrics = async (startPoint, route, config) => {
    let currentPos = { lat: startPoint.lat, lng: startPoint.lng };
    let metrics = { totalDistance: 0, totalTime: 0, totalFuel: 0, totalCost: 0, stops: [] };

    // Explicitly add the starting loop journey from Office
    if (route.length > 0 && startPoint) {
        metrics.stops.push({
            id: 'HQ-START-' + (route[0]?.driverId || 'SYS'),
            customer: 'Office Departure',
            address: 'Headquarters Coordinates',
            priority: 'Low',
            weight: 0,
            status: 'Pending',
            lat: startPoint.lat,
            lng: startPoint.lng,
            driverId: route[0]?.driverId || '',
            arrivalTime: 0
        });
    }

    for (const stop of route) {
        const dist = calculateDistance(currentPos.lat, currentPos.lng, stop.lat, stop.lng);

        // Predict traffic for each segment or static override
        const trafficMult = config.staticTrafficMultiplier || await fetchTrafficMultiplier(dist, stop.roadType || 0);

        const time = predictTravelTime(dist, trafficMult, config.baseSpeed);
        const fuel = calculateFuel(dist, trafficMult, config.vehicleConsumptionRate);

        const arrivalTime = metrics.totalTime + time;
        const penalty = validateConstraints(arrivalTime, stop.timeWindowEnd, config.latePenalty);
        const cost = calculateCost(time, fuel, penalty, config);

        metrics.totalDistance += dist;
        metrics.totalTime += time;
        metrics.totalFuel += fuel;
        metrics.totalCost += cost;
        metrics.stops.push({ ...stop, arrivalTime });

        currentPos = { lat: stop.lat, lng: stop.lng };
    }

    // Explicitly add the closed-loop return journey back to Office
    if (route.length > 0 && startPoint) {
        const returnDist = calculateDistance(currentPos.lat, currentPos.lng, startPoint.lat, startPoint.lng);
        const returnMult = config.staticTrafficMultiplier || await fetchTrafficMultiplier(returnDist, 0);

        const returnTime = predictTravelTime(returnDist, returnMult, config.baseSpeed);
        const returnFuel = calculateFuel(returnDist, returnMult, config.vehicleConsumptionRate);
        const returnCost = calculateCost(returnTime, returnFuel, 0, config);

        metrics.totalDistance += returnDist;
        metrics.totalTime += returnTime;
        metrics.totalFuel += returnFuel;
        metrics.totalCost += returnCost;

        metrics.stops.push({
            id: 'HQ-RETURN-' + (route[0]?.driverId || 'SYS'),
            customer: 'Return to Office',
            address: 'Headquarters Coordinates',
            priority: 'Low',
            weight: 0,
            status: 'Pending',
            lat: startPoint.lat,
            lng: startPoint.lng,
            driverId: route[0]?.driverId || '',
            arrivalTime: metrics.totalTime
        });
    }

    return metrics;
};

/**
 * Default Configuration for Optimization
 * No hardcoded constants in the logic - all pulled from here.
 */
const DEFAULT_CONFIG = {
    vehicleConsumptionRate: 0.15, // fuelRate: liters/km
    baseSpeed: 40,               // baseSpeed: km/h
    latePenalty: 20,             // Fixed penalty minutes for being late
    timeWeight: 0.6,
    fuelWeight: 0.3,
    penaltyWeight: 0.1
};

/**
 * Public API: Optimize full route using backend Enterprise VRP (OR-Tools)
 */
export const optimizeVRP = async (office, vehicles, stops) => {
    try {
        const response = await fetch(API_ROUTES.optimizeRoute, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ office, vehicles, stops })
        });
        if (!response.ok) throw new Error('VRP optimization failed');
        return await response.ok ? await response.json() : null;
    } catch (error) {
        console.error("Enterprise optimization error:", error);
        return null;
    }
};

/**
 * Public API: Optimize full route (Local Hybrid)
 */
export const optimizeRoute = async (startLocation, stops, config = DEFAULT_CONFIG) => {
    // Use merge to allow partial configs
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    // 1. Build
    const initial = await buildInitialRoute(startLocation, stops, finalConfig);
    // 2. Improve
    const improved = await applyLocalImprovement(startLocation, initial, finalConfig);
    // 3. Score
    const final = await calculateFinalMetrics(startLocation, improved, finalConfig);

    return {
        orderedRoute: final.stops,
        totalDistance: Math.round(final.totalDistance * 100) / 100,
        totalTime: Math.round(final.totalTime * 100) / 100,
        totalFuel: Math.round(final.totalFuel * 100) / 100,
        totalCost: Math.round(final.totalCost * 100) / 100
    };
};

/**
 * Public API: Dynamic Re-optimization (for remaining stops)
 */
export const reoptimizeRoute = async (currentLocation, remainingStops, config = DEFAULT_CONFIG) => {
    return await optimizeRoute(currentLocation, remainingStops, config);
};

/**
 * Public API: Optimized route with history persistence
 */
export const optimizeWithPersistentHistory = async (currentLocation, fullRoute, currentStopIndex, config = DEFAULT_CONFIG) => {
    const completedStops = fullRoute.slice(0, currentStopIndex);
    const pendingStops = fullRoute.slice(currentStopIndex);

    const optimizationResult = await optimizeRoute(currentLocation, pendingStops, config);

    return [...completedStops, ...optimizationResult.orderedRoute];
};
