/**
 * Predicts the travel time for a given journey.
 * 
 * @param {number} distance - The distance to travel in kilometers.
 * @param {number} trafficMultiplier - Predicted traffic congestion factor.
 * @param {number} baseSpeed - The average speed of the vehicle in km/h.
 * @returns {number} The estimated travel time in minutes.
 */
export const predictTravelTime = (distance, trafficMultiplier, baseSpeed) => {
    // Formula: (distance / baseSpeed) * traffic_multiplier
    // Multiply by 60 to convert hours to minutes
    const hours = (distance / baseSpeed) * trafficMultiplier;
    const estimatedMinutes = hours * 60;

    return Math.round(estimatedMinutes * 100) / 100;
};
