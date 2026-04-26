/**
 * USES: Centralized color management for the fleet.
 * SUPPORT: Provides consistent mapping between driver identities and visual colors across the map, dashboard, and management panels.
 */

const FLEET_COLORS = [
    '#f79009', // Deep Orange (Success 1) - distinct from blue preview
    '#2e90fa', // Azure Blue
    '#12b76a', // Emerald Green
    '#ee46bc', // Hot Pink
    '#7a5af8', // Royal Purple
    '#f04438', // Scarlet Red
    '#00d5ff', // Cyber Cyan
    '#17b26a', // Spring Green
    '#9b2c2c', // Maroon
    '#4a5568', // Charcoal
    '#fb6514', // Sunset Orange
    '#6690ff', // Soft Blue
    '#32d583', // Mint Green
    '#9e77ed', // Lavender
    '#f04438'  // Rose Red
];

/**
 * Generates a stable color for a given driver ID.
 * @param {string|number} driverId 
 * @returns {string} Hex color
 */
export const getFleetColor = (driverId) => {
    // No gray fallbacks - use vibrant MAGENTA if ID is missing (so it's impossible to miss)
    if (driverId === undefined || driverId === null || driverId === 'unassigned') return '#ff00ff';
    const hash = String(driverId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return FLEET_COLORS[hash % FLEET_COLORS.length];
};
