import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
    generateNextTrafficMultiplier, 
    getTrafficStatusLabel, 
    TRAFFIC_CONFIG 
} from '@shared/logic/trafficSimulation';

const TrafficContext = createContext();

export const TrafficProvider = ({ children }) => {
    const [trafficMultiplier, setTrafficMultiplier] = useState(1.0);
    const [trafficStatus, setTrafficStatus] = useState('Optimal');

    useEffect(() => {
        const interval = setInterval(() => {
            const newMultiplier = generateNextTrafficMultiplier();
            setTrafficMultiplier(newMultiplier);
            setTrafficStatus(getTrafficStatusLabel(newMultiplier));
        }, TRAFFIC_CONFIG.UPDATE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, []);

    return (
        <TrafficContext.Provider value={{ trafficMultiplier, trafficStatus }}>
            {children}
        </TrafficContext.Provider>
    );
};

export const useTraffic = () => {
    const context = useContext(TrafficContext);
    if (!context) {
        throw new Error('useTraffic must be used within a TrafficProvider');
    }
    return context;
};
