import { useState, useEffect } from 'react';

/**
 * Hook to manage real-time GPS tracking.
 * @param {boolean} active - Whether tracking should be enabled.
 * @returns {Object} { liveLocation, gpsStatus }
 */
export const useGps = (active) => {
    const [liveLocation, setLiveLocation] = useState(null);
    const [gpsStatus, setGpsStatus] = useState('Idle');

    useEffect(() => {
        if (!active) {
            setGpsStatus('Idle');
            setLiveLocation(null);
            return;
        }

        if (!navigator.geolocation) {
            setGpsStatus('Incompatible');
            return;
        }

        let watchId = null;

        const startGpsWatch = (highAccuracy = true) => {
            return navigator.geolocation.watchPosition(
                (pos) => {
                    setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setGpsStatus('Active');
                },
                (err) => {
                    if (err.code === 3 && highAccuracy) {
                        setGpsStatus('Searching...');
                        if (watchId) navigator.geolocation.clearWatch(watchId);
                        watchId = startGpsWatch(false);
                    } else if (err.code === 2) {
                        setGpsStatus('Searching...');
                    } else {
                        setGpsStatus('Permission Denied');
                    }
                },
                { enableHighAccuracy: highAccuracy, timeout: 30000, maximumAge: 60000 }
            );
        };

        watchId = startGpsWatch(true);

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [active]);

    return { liveLocation, gpsStatus };
};
