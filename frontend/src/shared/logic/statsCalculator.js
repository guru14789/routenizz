/**
 * Stats Calculator: Derived data logic for sustainability and cost analytics.
 */

import { calculateCarbonFootprint } from './fuelCalculator';

/**
 * Computes live operational metrics based on current route and autonomous environment.
 */
export const computeLiveStats = (orders, stats, trafficMultiplier) => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    
    // Improved estimation: calculate geodetic distance between sequential orders if route exists
    // Otherwise fallback to 6.5km urban average per drop
    const routeDistance = stats.totalDistance || (safeOrders.length * 6.5);
    
    // Core Fuel Logic: Baseline * Traffic Congestion Factor
    // Standard van consumption: 12L / 100km = 0.12L per km
    const fuelRate = 0.12; 
    const actualFuel = routeDistance * fuelRate * trafficMultiplier;
    
    // Economic Logic: ₹100 Petrol Price
    const fuelPrice = 100.0;
    const fuelCost = actualFuel * fuelPrice;
    
    // Labor Logic: ₹250/hr average, assuming 15 mins per stop + driving time
    const serviceTimeTotalHrs = (safeOrders.length * 15) / 60;
    const drivingTimeHrs = (routeDistance / 35); // 35km/h avg urban speed
    const laborCost = (serviceTimeTotalHrs + drivingTimeHrs) * 250;
    
    // Wear & Tear: ₹1.5 per km
    const wearCost = routeDistance * 1.5;

    const totalCost = fuelCost + laborCost + wearCost;
    
    const actualCarbon = calculateCarbonFootprint(actualFuel) || 0;

    return {
        fuel: actualFuel.toFixed(2),
        carbon: actualCarbon.toFixed(2),
        total_cost: totalCost.toFixed(2),
        breakdown: {
            fuel: fuelCost.toFixed(2),
            labor: laborCost.toFixed(2),
            wear: wearCost.toFixed(2)
        }
    };
};
