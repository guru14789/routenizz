/**
 * USES: Multi-objective routing cost calculation.
 * SUPPORT: Defines the mathematical weighted balance between speed, fuel efficiency, and penalty avoidance that determines the "optimal" route.
 */
/**

 * Cost Function Module
 * 
 * This module calculates the "Total Cost" of a route by balancing different
 * priorities like time efficiency, fuel consumption, and reliability (delays).
 */

/**
 * Calculates the total optimized cost of a journey using a weighted formula.
 * 
 * @param {number} time - Estimated travel time in minutes.
 * @param {number} fuel - Estimated fuel consumption in liters.
 * @param {number} delayPenalty - A value representing the impact of potential delays.
 * @param {object} config - Configuration object containing weights.
 * @returns {number} The total calculated cost.
 */
export const calculateCost = (time, fuel, delayPenalty, config) => {
    const { timeWeight, fuelWeight, penaltyWeight } = config;

    // Formula: (timeWeight × time) + (fuelWeight × fuel) + (penaltyWeight × delayPenalty)
    const totalCost = (timeWeight * time) + (fuelWeight * fuel) + (penaltyWeight * delayPenalty);

    return Math.round(totalCost * 100) / 100;
};
