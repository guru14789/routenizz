import { getUserIdToken } from './firebaseService';

/**
 * Synchronizes the Firebase ID Token with the backend session.
 */
export const syncWithBackend = async () => {
    try {
        const token = await getUserIdToken();
        if (token) {
            localStorage.setItem('backend_jwt_token', token);
            console.log("[Auth] Backend session synchronized with Firebase ID Token.");
            return token;
        }
        return null;
    } catch (error) {
        console.error("Token sync error:", error);
        return null;
    }
};

export const loginToBackend = syncWithBackend; // Aliasing for compatibility

/**
 * Retrieves the current valid JWT token from storage.
 */
export const getBackendToken = () => {
    return localStorage.getItem('backend_jwt_token');
};

/**
 * Generates the Authorization header for fetch/axios calls.
 */
export const getAuthHeaders = () => {
    const token = getBackendToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * Clears the backend token on logout.
 */
export const logout = () => {
    localStorage.removeItem('backend_jwt_token');
};
