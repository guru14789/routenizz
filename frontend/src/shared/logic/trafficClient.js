/**
 * Traffic API Client
 * 
 * Logic to communicate with the FastAPI traffic prediction server.
 */
import { API_ROUTES } from '@app/config';
import { getAuthHeaders } from '@services/backendAuthService';

const TRAFFIC_API_URL = API_ROUTES.trafficPredict;
const DEFAULT_FALLBACK_MULTIPLIER = 1.2;

// Simple cache to avoid redundant API calls during 2-opt refinement
const predictionCache = new Map();

// Concurrency Limiter: Max 5 concurrent requests to prevent socket exhaustion
let activeRequests = 0;
const requestQueue = [];

const processQueue = () => {
    if (activeRequests >= 5 || requestQueue.length === 0) return;
    const { resolve } = requestQueue.shift();
    activeRequests++;
    resolve();
};

const waitInQueue = () => new Promise(resolve => {
    requestQueue.push({ resolve });
    processQueue();
});

/**
 * Fetches traffic multiplier from the ML model based on current context.
 */
export const fetchTrafficMultiplier = async (distance, roadType = 0) => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const historicalSpeed = 45.0;

    const cacheKey = `${distance.toFixed(2)}-${roadType}-${hour}`;

    if (predictionCache.has(cacheKey)) {
        return predictionCache.get(cacheKey);
    }

    // Wait for a slot in the concurrency queue
    await waitInQueue();

    try {
        const response = await fetch(TRAFFIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders() // Inject JWT for backend security
            },
            body: JSON.stringify({
                distance_km: distance,
                hour: hour,
                day_of_week: dayOfWeek,
                road_type: roadType,
                historical_speed: historicalSpeed
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        // Populate cache
        predictionCache.set(cacheKey, result.traffic_multiplier);

        // Optional: clear cache if it grows too large
        if (predictionCache.size > 2000) {
            const firstKey = predictionCache.keys().next().value;
            predictionCache.delete(firstKey);
        }

        return result.traffic_multiplier;
    } catch (error) {
        console.warn('Traffic API unreachable, using fallback:', error.message);
        return DEFAULT_FALLBACK_MULTIPLIER;
    } finally {
        activeRequests--;
        processQueue(); // Allow the next request to proceed
    }
};
