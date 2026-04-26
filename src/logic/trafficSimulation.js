/**
 * Real-time Traffic Simulation Logic: Simulates the unpredictable nature of urban congestion.
 */

export const TRAFFIC_CONFIG = {
    UPDATE_INTERVAL_MS: 5000,   // Updates every 5 seconds
    MIN_MULTIPLIER: 0.9,      // Light/Empty conditions
    MAX_MULTIPLIER: 2.6,      // Gridlock conditions
    HEAVY_CONGESTION_LEVEL: 1.8,
    MODERATE_TRAFFIC_LEVEL: 1.3
};

/**
 * Generates a new traffic multiplier within the configured safe bounds.
 */
export const generateNextTrafficMultiplier = () => {
    return Number((TRAFFIC_CONFIG.MIN_MULTIPLIER + Math.random() * (TRAFFIC_CONFIG.MAX_MULTIPLIER - TRAFFIC_CONFIG.MIN_MULTIPLIER)).toFixed(2));
};

/**
 * Maps traffic multiplier to a human-readable status code for UI.
 */
export const getTrafficStatusLabel = (multiplier) => {
    if (multiplier > TRAFFIC_CONFIG.HEAVY_CONGESTION_LEVEL) return 'Congested';
    if (multiplier > TRAFFIC_CONFIG.MODERATE_TRAFFIC_LEVEL) return 'Moderate Traffic';
    return 'On Time';
};
