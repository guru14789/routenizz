import React from 'react';
import './StatusBadge.css';

/**
 * StatusBadge Component
 * 
 * A simple badge that changes color based on the status text.
 * Props:
 * - status: "On Time" or "Delayed"
 */
const StatusBadge = ({ status }) => {
    // Logic to decide which CSS class to use
    let statusClass = "status-default"; // Default color

    if (status === "On Time") {
        statusClass = "status-on-time";
    } else if (status === "Delayed") {
        statusClass = "status-delayed";
    }

    return (
        <span className={`badge ${statusClass}`}>
            {status}
        </span>
    );
};

export default StatusBadge;
