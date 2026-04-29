import React from 'react';
import './StopDetails.css';

/**
 * StopDetails Component
 * 
 * A simple, beginner-friendly component to display the current stop.
 * Props:
 * - name: Name of the stop (e.g., "Central Station")
 * - time: Expected arrival time (e.g., "10:30 AM")
 * - location: Short address or area (e.g., "Downtown")
 */
const StopDetails = ({ name, time, location }) => {
    return (
        <div className="stop-details-container">
            <div className="stop-header">
                <h2 className="stop-name">{name || "Unnamed Stop"}</h2>
                <span className="arrival-time">{time || "--:--"}</span>
            </div>

            <p className="location-text">
                <span className="location-icon">📍</span>
                {location || "No location provided"}
            </p>
        </div>
    );
};

export default StopDetails;
