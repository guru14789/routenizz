import { API_BASE } from '@app/config';
import { getUserIdToken } from './firebaseService';

const API_BASE_URL = API_BASE;

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
            // We store Firebase ID token separately to avoid corrupting backend JWT
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
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

/**
 * Clears the backend token on logout.
 */
export const logout = () => {
    localStorage.removeItem('backend_jwt_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_email');
    localStorage.removeItem('driver_vehicle_id');
};
