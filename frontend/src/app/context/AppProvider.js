import React from 'react';
import { AuthProvider } from './AuthContext';
import { LogisticsProvider } from './LogisticsContext';
import { TrafficProvider } from './TrafficContext';

export const AppProvider = ({ children }) => {
    return (
        <AuthProvider>
            <LogisticsProvider>
                <TrafficProvider>
                    {children}
                </TrafficProvider>
            </LogisticsProvider>
        </AuthProvider>
    );
};
