/**
 * GPS Utilities: Manages real-time location sensing and telemetry.
 */

/**
 * Starts a persistent watch on the device location using the Geolocation API.
 * @param {Function} onUpdate Callback for successful location acquisition.
 * @param {Function} onError Callback for permission or signal failure.
 * @returns {number} The watchId used to stop the listener.
 */
export const startGpsWatch = (onUpdate, onError) => {
    if (!navigator.geolocation) {
        if (onError) onError(new Error("Geolocation not supported by this browser."));
        return null;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    return navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, heading, speed } = position.coords;
            onUpdate({
                lat: latitude,
                lng: longitude,
                heading: heading || 0,
                speed: speed || 0,
                timestamp: position.timestamp
            });
        },
        (error) => {
            if (onError) onError(error);
        },
        options
    );
};

/**
 * Stops an active GPS watch process.
 */
export const stopGpsWatch = (watchId) => {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
};
