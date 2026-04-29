import React from 'react';
import './NextStop.css';

/**
 * NextStop Component
 * 
 * A clean card to show the upcoming destination.
 * Props:
 * - name: The name of the next stop
 * - eta: Estimated Time of Arrival (e.g., "15 mins")
 * - distance: Distance remaining (e.g., "4.2 km")
 */
const NextStop = ({ name, eta, distance }) => {
    return (
        <div className="next-stop-card">
            <span className="next-label">Up Next</span>

            <div className="next-stop-main">
                <h3 className="next-stop-name">{name || "Upcoming Stop"}</h3>
            </div>

            <div className="next-stop-stats">
                <div className="stat-group">
                    <span className="stat-label">ETA</span>
                    <span className="stat-value">{eta || "--"}</span>
                </div>

                <div className="stat-group">
                    <span className="stat-label">Distance</span>
                    <span className="stat-value">{distance || "--"}</span>
                </div>
            </div>
        </div>
    );
};

export default NextStop;
