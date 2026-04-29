import React from 'react';
import './RouteProgress.css';

/**
 * RouteProgress Component
 * 
 * Displays how far along the driver is in their route.
 * Props:
 * - current: The number of the current stop (e.g., 2)
 * - total: The total number of stops in the route (e.g., 5)
 */
const RouteProgress = ({ current, total }) => {
    // Ensure we don't divide by zero and handle empty states
    const safeTotal = total > 0 ? total : 1;
    const safeCurrent = current || 0;

    // Calculate percentage for the CSS width
    const percentage = Math.min((safeCurrent / safeTotal) * 100, 100);

    return (
        <div className="progress-section">
            <div className="progress-text">
                <span className="stop-counter">
                    Stop <strong>{safeCurrent}</strong> of <strong>{safeTotal}</strong>
                </span>
                <span className="percentage-text">{Math.round(percentage)}% Complete</span>
            </div>

            <div className="progress-bar-container">
                {/* We use inline style to dynamically set the width based on progress */}
                <div
                    className="progress-bar-fill"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export default RouteProgress;
