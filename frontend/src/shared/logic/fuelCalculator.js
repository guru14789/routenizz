/**
 * USES: Mathematical calculations for resource consumption.
 * SUPPORT: Provides accurate estimates for fuel usage and CO2 emissions based on distance and traffic conditions, enabling green-logistics tracking.
 */
/**

 * Calculates the amount of fuel needed for a trip.
 * 
 * @param {number} distance - The total distance of the trip.
 * @param {number} trafficMultiplier - ML predicted traffic factor.
 * @param {number} fuelRate - The fuel consumption rate (liters per km).
 * @returns {number} The total fuel needed, rounded to 2 decimal places.
 */
export const calculateFuel = (distance, trafficMultiplier, fuelRate) => {
    // Formula: distance * fuelRate * traffic_multiplier
    const totalFuel = distance * fuelRate * trafficMultiplier;

    return Math.round(totalFuel * 100) / 100;
};

/**
 * Legacy Alias for calculateFuel to maintain backward compatibility.
 */
export const calculateFuelConsumption = calculateFuel;

/**
 * Calculates the carbon footprint based on fuel used.
 * 
 * @param {number} fuelUsed - Total liters of fuel.
 * @returns {number} The estimated kg of CO2 emitted.
 */
export const calculateCarbonFootprint = (fuelUsed) => {
    // Constant: Roughly 2.31kg of CO2 per liter of fuel
    const totalCarbon = fuelUsed * 2.31;
    return Math.round(totalCarbon * 100) / 100;
};
