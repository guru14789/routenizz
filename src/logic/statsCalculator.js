/**
 * Stats Calculator: Derived data logic for sustainability and cost analytics.
 */

import { calculateFuelConsumption, calculateCarbonFootprint } from './fuelCalculator';

/**
 * Computes live operational metrics based on current route and autonomous environment.
 */
export const computeLiveStats = (orders, stats, trafficMultiplier) => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    
    // Use actual route distance where available, otherwise estimate (5km per drop)
    const routeDistance = stats.totalDistance || (safeOrders.length * 5);
    
    // Core Fuel Logic: Baseline * Traffic Congestion Factor
    const baseFuel = calculateFuelConsumption(routeDistance, 1.0, 0.15) || 0;
    const actualFuel = baseFuel * trafficMultiplier;
    
    // Sustainability Logic: Carbon derived from final fuel burn
    const actualCarbon = calculateCarbonFootprint(actualFuel) || 0;

    return {
        fuel: (actualFuel || 0).toFixed(2),
        carbon: (actualCarbon || 0).toFixed(2)
    };
};
