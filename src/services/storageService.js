/**
 * Storage Service: Manages localized persistent data between application sessions.
 */

export const STORAGE_KEYS = {
    USER_PROFILE: 'route_user',
    MASTER_ORDERS: 'route_orders',
    ACTIVE_ROUTE: 'route_active',
    CURRENT_INDEX: 'route_index',
    ROUTE_STATUS: 'route_status',
    SYSTEM_SETTINGS: 'route_settings'
};

/**
 * Persists data to standard browser local storage with JSON serialization.
 */
export const saveToStorage = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error(`Storage save error for key: ${key}`, e);
    }
};

/**
 * Retrieves data from browser local storage with JSON parsing.
 */
export const getFromStorage = (key) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.error(`Storage read error for key: ${key}`, e);
        return null;
    }
};

/**
 * Syncs multiple UI states to persistent storage in a single pass.
 */
export const syncAppStatesToStorage = (states) => {
    Object.keys(states).forEach(key => {
        saveToStorage(STORAGE_KEYS[key.toUpperCase()], states[key]);
    });
};

/**
 * Ensures a healthy base state for a new application instance.
 */
export const initializeDefaultStorage = () => {
    try {
        if (getFromStorage(STORAGE_KEYS.MASTER_ORDERS) === null) saveToStorage(STORAGE_KEYS.MASTER_ORDERS, []);
        if (getFromStorage(STORAGE_KEYS.ACTIVE_ROUTE) === null) saveToStorage(STORAGE_KEYS.ACTIVE_ROUTE, []);
        if (getFromStorage(STORAGE_KEYS.USER_PROFILE) === null) saveToStorage(STORAGE_KEYS.USER_PROFILE, null);
    } catch (e) {
        console.error("Default storage initialization failed:", e);
    }
};
