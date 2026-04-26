/**
 * USES: Fleet Command Center dashboard UI.
 * SUPPORT: Provides high-level visualization of the active network, includes the order entry form, and triggers global fleet optimizations by delegating to the App's VRP orchestrator.
 */
import React, { useState, useEffect } from 'react'; // React core for managing local UI states like dispatch banners
import { useNavigate } from 'react-router-dom';
import OrderForm from './OrderForm'; // Import the order input component for adding manual tasks
import RouteMap from './RouteMap'; // Import the Leaflet-based map for spatial visualization
import PremiumStats from './PremiumStats'; // Import the KPI visualization strip
import SystemHealth from './SystemHealth'; // Live backend dependency health monitor

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
    const [events, setEvents] = useState([
        { id: 1, time: '10:42:15', msg: '[AUTONOMOUS] Reroute triggered for Fleet Alpha.', type: 'primary' },
        { id: 2, time: '10:41:50', msg: '[VRP-ENGINE] Global solve complete. 12% gain.', type: 'secondary' },
        { id: 3, time: '10:39:22', msg: '[TELEMETRY] Driver DRV-001 in traffic zone.', type: 'warn' }
    ]);

    // Simulate real-time events for Orion feel
    useEffect(() => {
        if (isCalculating) {
            const newEvent = {
                id: Date.now(),
                time: new Date().toLocaleTimeString([], { hour12: false }),
                msg: '[VRP-ENGINE] Recalculating optimal sequence...',
                type: 'primary'
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 5));
        }
    }, [isCalculating]);

    // Handler logic for the primary optimization action
    const handleGenerateRoute = async () => {
        await onRecalculate(); // Block until the VRP solver returns a solution
        setJustDispatched(true); // Show the "Success" banner in the UI
        setTimeout(() => setJustDispatched(false), 10000); // Auto-hide the banner after 10 seconds
    };

    return (
        <div className="command-center">

            <section className="stats-strip" style={{ marginBottom: '24px' }}>
                <PremiumStats
                    orders={orders}
                    route={route}
                    onActiveOrdersClick={onActiveOrdersClick}
                    onRouteStopsClick={onRouteStopsClick}
                    onCompletedOrdersClick={onCompletedOrdersClick}
                    compact={false}
                    stats={stats}
                />
            </section>

            <div className="dynamic-grid" style={{ gridTemplateColumns: '350px 1fr', alignItems: 'start' }}>

                <div className="analytics-card" style={{ padding: '0' }}>
                    <div className="feed-header">
                        <span className="feed-title">NEW ASSIGNMENT</span>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <OrderForm onAddOrder={onAddOrder} drivers={drivers} />

                        <button className="prime-login-btn" onClick={handleGenerateRoute} disabled={isCalculating} style={{ marginTop: '24px' }}>
                            {isCalculating ? 'CALIBRATING...' : 'EXECUTE FLEET OPTIMIZATION'}
                        </button>

                        {justDispatched && (
                            <div style={{ marginTop: '16px', padding: '12px', background: '#000', color: '#fff', border: '2px solid #fff', fontSize: '10px', fontWeight: 800 }}>
                                [SYSTEM] FLEET DISPATCHED SUCCESSFULLY
                            </div>
                        )}
                    </div>
                </div>

                <div className="analytics-card" style={{ padding: '0' }}>
                    <div className="feed-header">
                        <span className="feed-title">ACTIVE TELEMETRY</span>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '10px' }}>
                            <span>GPS: {gpsStatus === 'Active' ? '[OK]' : '[WARN]'}</span>
                            <span>NET: [STABLE]</span>
                        </div>
                    </div>
                    <div style={{ height: '400px', background: '#eee', position: 'relative' }}>
                        <RouteMap stops={route} unassignedOrders={orders} />
                    </div>
                    
                    <SystemHealth />

                    <div className="operational-feed" style={{ border: 'none', marginTop: '0', borderTop: '2px solid #000' }}>
                        <div className="feed-header" style={{ background: '#f9f9f9', color: '#000', borderBottom: '1px solid #000' }}>
                            <span className="feed-title">OPERATIONAL INTELLIGENCE</span>
                            <span className="feed-status" style={{ color: '#000' }}>LIVE_FEED</span>
                        </div>
                        <div className="feed-content" style={{ maxHeight: '150px' }}>
                            {events.map(event => (
                                <div className="feed-item" key={event.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <span className="feed-time" style={{ fontWeight: 800 }}>{event.time}</span>
                                    <span className="feed-msg">
                                        <strong style={{ color: '#000' }}>
                                            {event.msg.split(' ')[0]}
                                        </strong>
                                        {event.msg.substring(event.msg.indexOf(' '))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard; // Export for use in the AdminPage orchestration
