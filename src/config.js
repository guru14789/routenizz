/**
 * USES: Centralized frontend configuration.
 * SUPPORT: Provides a single source of truth for all backend API endpoints,
 * eliminating hardcoded IPs scattered across multiple files.
 *
 * To change the backend URL for any environment, set VITE_API_BASE_URL in your .env file:
 *   VITE_API_BASE_URL=http://your-server-ip:8001
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export const API_ROUTES = {
    // Traffic & ML Prediction
    trafficPredict: `${API_BASE}/api/v1/traffic/predict`,
    trafficGeocode: `${API_BASE}/api/v1/traffic/geocode`,

    // VRP / Logistics Optimization
    optimizeRoute: `${API_BASE}/api/v1/logistics/optimize-route`,

    // Real-time Navigation Recalculation
    navRecalculate: `${API_BASE}/api/v1/navigation/recalculate`,

    // Analytics & Engine Intelligence
    analytics: `${API_BASE}/api/v1/analytics`,

    // Task & Job Management
    taskStatus: (taskId) => `${API_BASE}/api/v1/tasks/status/${taskId}`
};
