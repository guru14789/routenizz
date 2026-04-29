import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribeToOrders, subscribeToDrivers } from '../../services/firebaseService';
import { API_BASE } from '@app/config';
import { useAuth } from './AuthContext';

const LogisticsContext = createContext();

export const LogisticsProvider = ({ children }) => {
    const { user, activeRole, firebaseReady } = useAuth();
    const [orders, setOrders] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [route, setRoute] = useState([]);
    const [routeStatus, setRouteStatus] = useState('Idle');
    const [isCalculating, setIsCalculating] = useState(false);

    // 1. Subscribe to Firebase Collections (Only when Firebase Auth is Ready)
    useEffect(() => {
        if (!user || !firebaseReady) {
            if (user) console.log("[LogisticsContext] Data stale: Waiting for Firebase session...");
            return;
        }

        console.log("[LogisticsContext] Initializing Firebase subscriptions...");
        const unsubscribeOrders = subscribeToOrders((newOrders) => {
            if (newOrders) setOrders(newOrders);
        });

        const unsubscribeDrivers = subscribeToDrivers((newDrivers) => {
            if (newDrivers) setDrivers(newDrivers);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeDrivers();
        };
    }, [user, firebaseReady]);

    // 2. Poll Driver Route if activeRole is driver
    useEffect(() => {
        if (activeRole !== 'driver' || !user) return;

        const fetchRoute = async () => {
            try {
                const driverId = localStorage.getItem('driver_vehicle_id') || user.uid;
                const response = await fetch(`${API_BASE}/api/v1/driver/route/${driverId}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('backend_jwt_token')}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setRouteStatus(data.status);
                    if (data.status === 'active' && data.stops) {
                        setRoute(data.stops);
                    }
                }
            } catch (e) {
                console.warn("[LogisticsContext] Driver route poll failed:", e);
            }
        };

        fetchRoute();
        const interval = setInterval(fetchRoute, 5000);
        return () => clearInterval(interval);
    }, [activeRole, user]);

    return (
        <LogisticsContext.Provider value={{ 
            orders, 
            setOrders,
            drivers, 
            route, 
            setRoute,
            routeStatus, 
            setRouteStatus,
            isCalculating, 
            setIsCalculating 
        }}>
            {children}
        </LogisticsContext.Provider>
    );
};

export const useLogistics = () => {
    const context = useContext(LogisticsContext);
    if (!context) {
        throw new Error('useLogistics must be used within a LogisticsProvider');
    }
    return context;
};
