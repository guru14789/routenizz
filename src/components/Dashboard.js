/**
 * USES: Fleet Command Center dashboard UI.
 * SUPPORT: Provides high-level visualization of the active network, includes the order entry form, and triggers global fleet optimizations by delegating to the App's VRP orchestrator.
 */
import React, { useState } from 'react'; // React core for managing local UI states like dispatch banners
import OrderForm from './OrderForm'; // Import the order input component for adding manual tasks
import RouteMap from './RouteMap'; // Import the Leaflet-based map for spatial visualization
import PremiumStats from './PremiumStats'; // Import the KPI visualization strip

const Dashboard = ({
    orders,
    route,
    setRoute,
    isCalculating,
    onRecalculate,
    onAddOrder,
    onDeleteOrder,
    onActiveOrdersClick,
    onRouteStopsClick,
    onCompletedOrdersClick,
    drivers,
    onToggleRole,
    stats,
    gpsStatus  // Real GPS status threaded from App.js
}) => {
    // Local state to manage the success notification after a dispatch action
    const [justDispatched, setJustDispatched] = useState(false);

    // Handler logic for the primary optimization action
    const handleGenerateRoute = async () => {
        await onRecalculate(); // Block until the VRP solver returns a solution
        setJustDispatched(true); // Show the "Success" banner in the UI
        setTimeout(() => setJustDispatched(false), 10000); // Auto-hide the banner after 10 seconds
    };

    return ( // Return the layout for the Admin Command Center
        <div className="command-center"> {/* Root container for the dashboard flex-grid */}

            {/* Top Row: Key Performance Indicators */}
            <section className="stats-strip">
                <PremiumStats
                    orders={orders} // Pass orders for counts
                    route={route} // Pass route for distance/duration sums
                    onActiveOrdersClick={onActiveOrdersClick} // Link interactions
                    onRouteStopsClick={onRouteStopsClick} // Link interactions
                    onCompletedOrdersClick={onCompletedOrdersClick} // Link interactions
                    compact={false} // Use full-size visualization
                    stats={stats} // Pass pre-calculated financial metrics
                />
            </section>

            {/* Bottom Section: Side-by-side Control and Map visualization */}
            <div className="main-control-grid">

                {/* Left Column: Management Tools */}
                <div className="control-pane">
                    <div className="pane-header">
                        <h3>New Assignment</h3> {/* Section title */}
                        <p>Dispatch new payloads into the active network</p> {/* Sub-description */}
                    </div>

                    {/* Order Intake Form */}
                    <OrderForm onAddOrder={onAddOrder} drivers={drivers} />

                    {/* Primary Call to Action: Optimize Fleet */}
                    <button className="dispatch-action-btn" onClick={handleGenerateRoute} disabled={isCalculating}>
                        <span className="btn-icon">
                            {/* SVG icon for the "Fast Power" dispatch action */}
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                        </span>
                        {/* Dynamic label based on the solver state */}
                        {isCalculating ? 'Calibrating Routes...' : 'Optimize & Dispatch Fleet'}
                    </button>

                    {/* Contextual Success UI */}
                    {justDispatched && (
                        <div className="dispatch-success-banner">
                            <span>✅ Fleet Optimized & Dispatched</span> {/* User feedback */}
                            <button onClick={onToggleRole}>View as Driver</button> {/* Navigation shortcut */}
                        </div>
                    )}
                </div>

                {/* Right Column: Geographic Awareness */}
                <div className="map-pane">
                    <div className="pane-header">
                        <h3>Active Fleet Telemetry</h3> {/* Section title */}
                        <div className="telemetry-tags">
                            <span className={`tag ${gpsStatus === 'Active' ? 'tag-ok' : 'tag-warn'}`}>
                                GPS: {gpsStatus || 'Unknown'}
                            </span>
                            <span className="tag">Network: Stable</span>
                        </div>
                    </div>
                    <div className="map-container-inner">
                        {/* Integrated Interactive Map showing all routes and stop pins */}
                        <RouteMap stops={route} unassignedOrders={orders} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard; // Export for use in the AdminPage orchestration
