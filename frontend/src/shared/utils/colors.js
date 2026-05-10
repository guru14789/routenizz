/**
 * USES: Centralized color management for the fleet.
 * SUPPORT: Provides consistent mapping between driver identities and visual colors across the map, dashboard, and management panels.
 */

const FLEET_COLORS = [
    '#000000', // Black
    '#1e293b', // Slate 800
    '#0f172a', // Slate 900
    '#334155', // Slate 700
    '#475467', // Slate 600
    '#64748b', // Slate 500
    '#000000'  // Pure Black
];

/**
 * Generates a stable color for a given driver ID.
 * @param {string|number} driverId 
 * @returns {string} Hex color
 */
export const getFleetColor = (driverId) => {
    // No gray fallbacks - use vibrant MAGENTA if ID is missing (so it's impossible to miss)
    if (driverId === undefined || driverId === null || driverId === 'unassigned') return '#111827';
    const hash = String(driverId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return FLEET_COLORS[hash % FLEET_COLORS.length];
};
