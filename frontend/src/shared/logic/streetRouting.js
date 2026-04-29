/**
 * USES: Street-level mapping and turn-by-turn navigation utility.
 * SUPPORT: Converts abstract geographic coordinates into real-world road paths using OSRM, providing precise distance, duration, and navigation instructions for drivers.
 */
/**

 * Street Routing Utility using OSRM (Open Source Routing Machine)
 * This turns straight lines into real street paths just like Google Maps.
 */
import { API_ROUTES } from '@app/config';
import { getAuthHeaders } from '@services/backendAuthService';

/**
 * Fetches street-level geometry for a sequence of stops.
 * @param {Array} coordinates - Array of [lat, lng] pairs
 * @returns {Promise<Array>} - Array of [lat, lng] pairs representing the street path
 */
export const fetchStreetRoute = async (coordinates) => {
    if (!coordinates || coordinates.length < 2) return coordinates;

    try {
        // Convert to OSRM format: lng,lat;lng,lat
        const locString = coordinates
            .map(coord => `${coord[1]},${coord[0]}`)
            .join(';');

        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson&steps=true`
        );

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.warn('OSRM Route failed, falling back to straight lines:', data.code);
            return { path: coordinates, steps: [] };
        }

        // Extract geometry from GeoJSON (OSRM returns [lng, lat], we need [lat, lng])
        const streetCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

        // Extract turn-by-turn steps
        const steps = [];
        if (data.routes[0].legs) {
            data.routes[0].legs.forEach(leg => {
                if (leg.steps) {
                    leg.steps.forEach(step => {
                        if (step.maneuver && step.maneuver.type !== "arrive") {
                            const type = step.maneuver.type;
                            const modifierRaw = step.maneuver.modifier ? step.maneuver.modifier.replace('-', ' ') : '';
                            const modifier = modifierRaw ? modifierRaw.charAt(0).toUpperCase() + modifierRaw.slice(1) : 'Straight';

                            // High accuracy extraction
                            const street = step.name ? step.name : '';
                            const ref = step.ref ? ` (${step.ref})` : '';
                            const destinations = step.destinations ? ` towards ${step.destinations.split(',')[0].trim()}` : '';
                            const exit = step.maneuver.exit ? ` exit ${step.maneuver.exit}` : '';

                            let target = street ? ` onto ${street}${ref}` : (ref ? ` onto ${ref.replace(/[()]/g, '')}` : '');
                            target += destinations;

                            let instructionBase = "";
                            switch (type) {
                                case 'turn':
                                    instructionBase = `Turn ${modifier}${target}`;
                                    break;
                                case 'new name':
                                case 'continue':
                                    instructionBase = `Continue ${modifier}${target}`;
                                    break;
                                case 'depart':
                                    instructionBase = `Head ${modifier}${target}`;
                                    break;
                                case 'merge':
                                    instructionBase = `Merge ${modifier}${target}`;
                                    break;
                                case 'ramp':
                                    instructionBase = `Take the ramp ${modifier}${target}`;
                                    break;
                                case 'fork':
                                    instructionBase = `At the fork, keep ${modifier}${target}`;
                                    break;
                                case 'roundabout':
                                case 'rotary':
                                    instructionBase = `At the roundabout, take${exit}${target}`;
                                    break;
                                case 'end of road':
                                    instructionBase = `At the end of the road, turn ${modifier}${target}`;
                                    break;
                                case 'off ramp':
                                    instructionBase = `Take the ${modifier} off-ramp${target}`;
                                    break;
                                default:
                                    instructionBase = `${type.charAt(0).toUpperCase() + type.slice(1)} ${modifier}${target}`;
                            }

                            // Clean formatting anomalies and improve precision
                            let finalInstruction = instructionBase.replace(/\s+/g, ' ').replace(' onto ', ' onto ').trim();
                            if (finalInstruction.endsWith(' onto')) finalInstruction = finalInstruction.replace(' onto', '');
                            
                            // Accuracy Fix: If street name is missing, try to use the modifier
                            if (!street && !ref) {
                                finalInstruction = `${type.charAt(0).toUpperCase() + type.slice(1)} ${modifier}`.trim();
                            }

                            steps.push({
                                instruction: finalInstruction,
                                distance: step.distance,
                                location: [step.maneuver.location[1], step.maneuver.location[0]], // [lat, lng]
                            });
                        }
                    });
                }
            });
        }

        return { path: streetCoords, steps };
    } catch (error) {
        console.error('Error fetching street route:', error);
        return { path: coordinates, steps: [] }; // Fallback to straight lines on error
    }
};

/**
 * Fetches the actual street name for a given lat/lng using Nominatim (OpenStreetMap).
 * This provides higher accuracy than raw OSRM step names.
 */
export const reverseGeocode = async (lat, lng) => {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': 'TNImpact-Logistics-App' // Required by Nominatim policy
                }
            }
        );
        const data = await response.json();
        
        if (data && data.address) {
            const addr = data.address;
            // Prioritize road/suburb/neighbourhood for local accuracy
            return addr.road || addr.suburb || addr.neighbourhood || addr.city || "Unnamed Road";
        }
        return "Unknown Location";
    } catch (error) {
        console.error("Reverse geocode failed:", error);
        return "Unnamed Road";
    }
};

/**
 * Fetches Distance and Duration for a route
 */
export const fetchRouteMetadata = async (coordinates) => {
    if (!coordinates || coordinates.length < 2) return { distance: 0, duration: 0 };

    try {
        const locString = coordinates
            .map(coord => `${coord[1]},${coord[0]}`)
            .join(';');

        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${locString}?overview=false`
        );

        const data = await response.json();

        if (data.code !== 'Ok') return { distance: 0, duration: 0 };

        return {
            distance: (data.routes[0].distance / 1000).toFixed(2), // KM
            duration: Math.round(data.routes[0].duration / 60) // Minutes
        };
    } catch (error) {
        return { distance: 0, duration: 0 };
    }
};

/**
 * Fetches an ML-Optimized route from the local SmartRouteEngine backend.
 */
export const fetchOptimizedRoute = async (origin, destination) => {
    try {
        const response = await fetch(API_ROUTES.navRecalculate, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders() // Inject JWT for backend security
            },
            body: JSON.stringify({
                trip_id: 'smart_ui_sim_' + Date.now(),
                current_lat: origin.lat,
                current_lng: origin.lng,
                dest_lat: destination.lat,
                dest_lng: destination.lng
            })
        });

        if (!response.ok) throw new Error("Backend optimization failed");

        const data = await response.json();

        // Map Python backend response fields natively back to what the local React component expects
        return {
            selected_route_geometry: data.best_route,
            predicted_eta_seconds: data.best_eta * 60, // Convert minutes back to seconds for UI string formatting
            distance_km: data.distance_km || 0,
            optimization_score: data.improvement_percent || 0
        };

    } catch (error) {
        console.warn("Optimized route fetch failed, falling back to standard OSRM:", error.message);
        return null;
    }
};
