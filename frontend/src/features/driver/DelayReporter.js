import React, { useState } from 'react';
import './DelayReporter.css';

/**
 * DelayReporter Component
 * 
 * Simple logic to handle reporting a delivery delay.
 */
const DelayReporter = () => {
    // 1. Initial State
    const [delayMinutes, setDelayMinutes] = useState(0);
    const [status, setStatus] = useState("On Time");
    const baseArrivalTime = "12:00 PM";

    // 2. Click Handler Logic
    const handleReportDelay = () => {
        // Increase delay by 10
        setDelayMinutes(prev => prev + 10);

        // Change status to Delayed
        setStatus("Delayed");
    };

    return (
        <div className="delay-container">
            <div className="info-box">
                <span className="eta-label">Expected Arrival</span>
                <div className="eta-time">{baseArrivalTime}</div>

                {/* Only show 'Delayed' text if there is actual delay */}
                <p className={`status-text ${status === "Delayed" ? "delayed" : "on-time"}`}>
                    Status: {status} {delayMinutes > 0 ? `(+${delayMinutes} mins)` : ""}
                </p>
            </div>

            <button className="report-button" onClick={handleReportDelay}>
                ⚠️ Report 10m Delay
            </button>

            {delayMinutes > 0 && (
                <p className="delay-notice">
                    New estimated time: {baseArrivalTime} plus {delayMinutes} minutes
                </p>
            )}
        </div>
    );
};

export default DelayReporter;
