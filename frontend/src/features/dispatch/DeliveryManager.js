import React, { useState } from 'react';
import './DeliveryManager.css';

/**
 * DeliveryManager Component
 * 
 * Simple logic to cycle through a list of stops.
 */
const DeliveryManager = () => {
    // 1. A simple list of stops for our route
    const routeStops = [
        { name: "Central Mall", address: "123 Main St" },
        { name: "Global Logistics Hub", address: "45 Industrial Ave" },
        { name: "Riverside Warehouse", address: "90 River Road" },
        { name: "North Side Retail", address: "12 Retail District" },
    ];

    // 2. Track which stop we are currently on (starts at 0)
    const [currentIndex, setCurrentIndex] = useState(0);

    // 3. Logic to move to the next stop
    const handleComplete = () => {
        // We just add 1 to the current index
        setCurrentIndex(prevIndex => prevIndex + 1);
    };

    // 4. Check if the route is finished
    const isFinished = currentIndex >= routeStops.length;

    // 5. Completion Screen
    if (isFinished) {
        return (
            <div className="delivery-manager completion-screen">
                <span className="completion-icon">🏁</span>
                <h2>Route Completed</h2>
                <p>All deliveries were successful. Time to head back to base!</p>
                <button
                    className="complete-button"
                    style={{ backgroundColor: '#4c6ef5', marginTop: '20px' }}
                    onClick={() => setCurrentIndex(0)} // Reset for demo purposes
                >
                    Start New Route
                </button>
            </div>
        );
    }

    // 6. Current Stop Data
    const currentStop = routeStops[currentIndex];

    return (
        <div className="delivery-manager">
            <div className="delivery-card">
                <span className="progress-label">
                    STOP {currentIndex + 1} OF {routeStops.length}
                </span>

                <div className="stop-info">
                    <h2>{currentStop.name}</h2>
                    <p className="stop-address">📍 {currentStop.address}</p>
                </div>

                <button className="complete-button" onClick={handleComplete}>
                    ✅ Complete Delivery
                </button>
            </div>
        </div>
    );
};

export default DeliveryManager;
