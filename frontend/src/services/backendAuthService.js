import { API_BASE } from '@app/config';
import { getUserIdToken } from './firebaseService';

const API_BASE_URL = API_BASE;

// ── JWT token refresh state ────────────────────────────────────────────────
let _refreshTimer = null;

/**
 * Decode a JWT payload without verifying the signature.
 * Used client-side only to check expiry time.
 */
const _decodeJwtPayload = (token) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
};

/**
 * Schedule an automatic token refresh 2 minutes before expiry.
 * BUG FIX: Previously no refresh existed, causing forced logouts every 30 min.
 */
const _scheduleRefresh = (token) => {
    if (_refreshTimer) clearTimeout(_refreshTimer);

    const payload = _decodeJwtPayload(token);
    if (!payload?.exp) return;

    const expiresInMs = (payload.exp * 1000) - Date.now();
    const refreshInMs = expiresInMs - 2 * 60 * 1000; // 2 min before expiry

    if (refreshInMs <= 0) {
        _doRefreshToken();
        return;
    }

    _refreshTimer = setTimeout(() => _doRefreshToken(), refreshInMs);
};

/**
 * Call the /refresh endpoint and persist the new token.
 */
const _doRefreshToken = async () => {
    const token = getBackendToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('backend_jwt_token', data.access_token);
            _scheduleRefresh(data.access_token); // Chain next refresh
            console.debug('[Auth] JWT refreshed successfully.');
        } else {
            console.warn('[Auth] Token refresh failed. User will need to re-login.');
            logout();
        }
    } catch (err) {
        console.error('[Auth] Refresh request error:', err);
    }
};

/**
 * Admin Login using Email/Password
 */
export const adminLogin = async (email, password) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('backend_jwt_token', data.access_token);
    localStorage.setItem('user_role', 'admin');
    localStorage.setItem('user_email', email);
    _scheduleRefresh(data.access_token); // Start auto-refresh cycle
    return data;
};

// Alias for backward compatibility with optimizer.js and other legacy components
export const loginToBackend = adminLogin;

/**
 * Admin Signup
 */
export const adminSignup = async (email, password) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/admin/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Signup failed');
    }

    return await response.json();
};

/**
 * Driver Login using Email + PIN
 */
export const driverLogin = async (email, pin) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/driver-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Invalid Credentials');
    }

    const data = await response.json();
    localStorage.setItem('backend_jwt_token', data.access_token);
    localStorage.setItem('user_role', 'driver');
    localStorage.setItem('user_email', email);
    localStorage.setItem('driver_vehicle_id', data.vehicle_id);
    _scheduleRefresh(data.access_token); // Drivers also get auto-refresh
    return data;
};

/**
 * Synchronizes the Firebase ID Token with the backend session.
 * (Preserved for compatibility, though we now use DB-backed auth primarily)
 */
export const syncWithBackend = async () => {
    try {
        const token = await getUserIdToken();
        if (token) {
            localStorage.setItem('firebase_id_token', token);
            return token;
        }
        return null;
    } catch (error) {
        return null;
    }
};

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
    return token
        ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
};

/**
 * Authenticated fetch with automatic 401 retry after token refresh.
 * Use this instead of raw fetch() for all authenticated API calls.
 * On 401: attempts one silent token refresh, then retries.
 * If refresh fails, calls logout() and throws.
 */
export const authFetch = async (url, options = {}) => {
    const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
    let response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        // Attempt refresh once
        await _doRefreshToken();
        const newHeaders = { ...getAuthHeaders(), ...(options.headers || {}) };
        response = await fetch(url, { ...options, headers: newHeaders });

        if (response.status === 401) {
            logout();
            throw new Error('Session expired. Please log in again.');
        }
    }

    return response;
};

/**
 * Restores the auto-refresh timer on page reload if a valid token exists.
 * Call this once at app startup (e.g., in App.js useEffect).
 */
export const restoreAuthSession = () => {
    const token = getBackendToken();
    if (token) {
        _scheduleRefresh(token);
    }
};

/**
 * Clears the backend token on logout.
 */
export const logout = () => {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = null;
    localStorage.removeItem('backend_jwt_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_email');
    localStorage.removeItem('driver_vehicle_id');
};
