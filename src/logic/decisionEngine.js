/**
 * Decision Engine Logic: The brain of the autonomous routing system.
 * Evaluates operational metrics and determines if an AI re-optimization is required.
 */

export const ARD_RULES = {
    DELAY_THRESHOLD_RECALC: 10,       // Minutes of predicted delay before rerouting
    PRIORITY_RISK_THRESHOLD: 5,      // Minutes of predicted delay for high-priority stops
    HEAVY_TRAFFIC_CONGESTION: 1.4,   // Multiplier threshold for fuel efficiency pass
    RECALC_COOLDOWN_MS: 45000        // Prevent logic spiraling
};

/**
 * Evaluates current vehicle/route state against ARD (Autonomous Route Decision) standards.
 * @returns {string|null} The reason for recalculation, or null if within normal bounds.
 */
export const evaluateRouteHealth = (predictedTotalDelay, hasHighPriorityRemaining, trafficMultiplier, lastRecalcTime) => {
    const now = Date.now();
    const isCooldownActive = (now - lastRecalcTime < ARD_RULES.RECALC_COOLDOWN_MS);

    if (isCooldownActive) return null;

    if (predictedTotalDelay > ARD_RULES.DELAY_THRESHOLD_RECALC) {
        return "Predictive Delay Threshold Exceeded";
    }

    if (hasHighPriorityRemaining && predictedTotalDelay > ARD_RULES.PRIORITY_RISK_THRESHOLD) {
        return "Priority Risk detected via Predictive Modeling";
    }

    if (trafficMultiplier > ARD_RULES.HEAVY_TRAFFIC_CONGESTION) {
        return "Fuel Efficiency optimization (Traffic Spike detected)";
    }

    return null;
};

/**
 * Calculates current delay factor using live traffic and historical performance drift.
 */
export const calculatePredictedDelay = (remainingStops, trafficMultiplier, delayHistory) => {
    const totalBaseTime = remainingStops.reduce((sum, s) => sum + (s.arrivalTime || 10), 0);
    
    // 1. Calculate Real-time Traffic Offset
    const trafficDelay = Math.round(totalBaseTime * (trafficMultiplier - 1.0));

    // 2. Calculate Predictive "Drift" from History (Moving average)
    const historicalDrift = delayHistory.length > 0 
        ? Math.round(delayHistory.reduce((a, b) => a + b, 0) / delayHistory.length) 
        : 0;

    return Math.max(0, trafficDelay + historicalDrift);
};
