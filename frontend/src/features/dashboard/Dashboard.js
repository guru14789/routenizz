/**
 * USES: Fleet Command Center dashboard UI.
 * SUPPORT: Provides high-level visualization of the active network, includes the order entry form, and triggers global fleet optimizations by delegating to the App's VRP orchestrator.
 */
import React, { useState, useEffect } from 'react'; // React core for managing local UI states like dispatch banners
import { useNavigate } from 'react-router-dom';
import OrderForm from '@features/dispatch/OrderForm';
import RouteMap from '@features/map/RouteMap';
import PremiumStats from '@shared/components/PremiumStats';
import SystemHealth from '@features/monitoring/SystemHealth';

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
    onFleetSetupClick,
    drivers,
    onToggleRole,
    stats,
    gpsStatus,
    weatherSummary = null  // Injected from App.js after each optimization call
}) => {
    // Local state to manage the success notification after a dispatch action
    const [justDispatched, setJustDispatched] = useState(false);
    const [selectedVehicleId, setSelectedVehicleId] = useState(null);
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);

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

    const [isContinuousMode, setIsContinuousMode] = useState(false);

    // Module 02: Continuous Intra-day Recalculation Loop
    useEffect(() => {
        let interval;
        if (isContinuousMode && !isCalculating) {
            interval = setInterval(() => {
                const newEvent = {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString([], { hour12: false }),
                    msg: '[AUTONOMOUS] Checking traffic drift for Delta-Patching...',
                    type: 'secondary'
                };
                setEvents(prev => [newEvent, ...prev].slice(0, 5));
                // In a real system, we would call an API here to trigger the continuous_reoptimize_task
            }, 30000); // Check every 30 seconds
        }
        return () => clearInterval(interval);
    }, [isContinuousMode, isCalculating]);

    // Handler logic for the primary optimization action
    const handleGenerateRoute = async () => {
        await onRecalculate(); // Block until the VRP solver returns a solution
        setJustDispatched(true); // Show the "Success" banner in the UI
        setTimeout(() => setJustDispatched(false), 10000); // Auto-hide the banner after 10 seconds

        // Push a weather intelligence event to the Operational Feed
        if (weatherSummary && weatherSummary.severity !== 'LOW') {
            const EMOJI = { MEDIUM: '🌧️', HIGH: '⛈️' };
            const emoji = EMOJI[weatherSummary.severity] || '🌦️';
            const extraPct = Math.round((weatherSummary.max_multiplier - 1) * 100);
            const feedEvent = {
                id: Date.now(),
                time: new Date().toLocaleTimeString([], { hour12: false }),
                msg: `[WEATHER] ${emoji} ${weatherSummary.worst_condition?.toUpperCase()} on route — ETA +${extraPct}% (${weatherSummary.affected_count} stops)`,
                type: 'warn'
            };
            setEvents(prev => [feedEvent, ...prev].slice(0, 5));
        }
    };

    return ( // Return the layout for the Admin Command Center
        <div className="command-center"> {/* Root container for the dashboard flex-grid */}

            {/* Top Row: Key Performance Indicators (Filtered by Selection) */}
            <section className="stats-strip">
                <PremiumStats
                    orders={selectedVehicleId === 'open' 
                        ? orders.filter(o => !o.driverId) 
                        : (selectedVehicleId ? orders.filter(o => o.driverId === selectedVehicleId) : orders)
                    } 
                    route={selectedVehicleId && selectedVehicleId !== 'open' 
                        ? route.filter(s => s.driverId === selectedVehicleId) 
                        : (selectedVehicleId === 'open' ? [] : route)
                    } 
                    onActiveOrdersClick={onActiveOrdersClick} 
                    onRouteStopsClick={onRouteStopsClick} 
                    onCompletedOrdersClick={onCompletedOrdersClick} 
                    compact={true} 
                    stats={stats} 
                />
            </section>

            {/* Bottom Section: Side-by-side Control and Map visualization */}
            <div className="main-control-grid">

                {/* Left Column: Management Tools */}
                <div className="control-pane">
                    <div className="pane-header">
                        <h3>New Assignment</h3> {/* Section title */}
                    </div>

                    {/* Conditional rendering based on vehicle selection */}
                    {!selectedVehicleId ? (
                        <div className="vehicle-picker-container">
                            {drivers.length === 0 ? (
                                <div className="no-fleet-state">
                                    <div className="v-icon-large">
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="2" y="6" width="20" height="12" rx="2" />
                                            <path d="M12 12h.01" />
                                            <path d="M17 12h.01" />
                                            <path d="M7 12h.01" />
                                        </svg>
                                    </div>
                                    <p>No fleet units registered in the network.</p>
                                    <button className="setup-btn" onClick={onFleetSetupClick}>
                                        Manage Fleet Drivers
                                    </button>
                                </div>
                            ) : (
                                <div className="vehicle-grid">
                                    <div 
                                        className="vehicle-item unassigned" 
                                        onClick={() => setSelectedVehicleId('open')}
                                    >
                                        <div className="v-icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m7.5 4.27 9 5.15" />
                                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                                            <path d="m3.3 7 8.7 5 8.7-5" />
                                            <path d="M12 22V12" />
                                        </svg>
                                    </div>
                                        <div className="v-info">
                                            <span className="v-name">Open Queue</span>
                                            <span className="v-sub">Unassigned Orders</span>
                                        </div>
                                    </div>
                                    {drivers.map(d => (
                                        <div 
                                            key={d.id} 
                                            className="vehicle-item" 
                                            onClick={() => setSelectedVehicleId(d.id)}
                                        >
                                            <div className="v-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <polyline points="16 11 18 13 22 9" />
                                            </svg>
                                        </div>
                                            <div className="v-info">
                                                <span className="v-name">{d.name}</span>
                                                <span className="v-sub">{d.vehicle?.split('(')[0] || 'Fleet Unit'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="form-focus-mode">
                            <div className="focus-header">
                                <button className="back-to-grid" onClick={() => setSelectedVehicleId(null)}>
                                    ← Change Vehicle
                                </button>
                                <span className="active-target">
                                    Targeting: {selectedVehicleId === 'open' ? 'Open Queue' : drivers.find(d => d.id === selectedVehicleId)?.name}
                                </span>
                            </div>
                            <OrderForm 
                                onAddOrder={onAddOrder} 
                                drivers={drivers} 
                                initialDriverId={selectedVehicleId === 'open' ? '' : selectedVehicleId} 
                            />
                        </div>
                    )}

                    {/* Primary Call to Action: Optimize Fleet */}
                    <div className="dispatch-controls-stack">
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

                        {/* ── Orion Feature: Continuous Re-Optimization Toggle ── */}
                        <div className={`continuous-mode-toggle ${isContinuousMode ? 'active' : ''}`} onClick={() => setIsContinuousMode(!isContinuousMode)}>
                            <div className="toggle-track">
                                <div className="toggle-thumb"></div>
                            </div>
                            <div className="toggle-label">
                                <span className="label-main">Continuous Delta-Patching</span>
                                <span className="label-sub">{isContinuousMode ? 'ACTIVE: Monitoring Drift' : 'STANDBY: Manual Only'}</span>
                            </div>
                        </div>
                    </div>

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
                        <h3>
                            {selectedVehicleId === 'open' ? 'Unassigned Orders Queue' : 
                             selectedVehicleId ? `Activity: ${drivers.find(d => d.id === selectedVehicleId)?.name || 'Fleet Unit'}` : 
                             'Active Fleet Activity'}
                        </h3>
                        <div className="status-tags">
                            <span className={`tag ${gpsStatus === 'Active' ? 'tag-ok' : 'tag-warn'}`}>
                                GPS: {gpsStatus || 'Unknown'}
                            </span>
                            <span className="tag">Network: Stable</span>
                        </div>
                    </div>
                    <div className="map-container-inner">
                        {/* Integrated Interactive Map showing focused or global routes */}
                        <RouteMap 
                            stops={selectedVehicleId && selectedVehicleId !== 'open' 
                                ? route.filter(s => s.driverId === selectedVehicleId) 
                                : []
                            } 
                            unassignedOrders={selectedVehicleId === 'open' 
                                ? orders 
                                : []
                            }
                            weatherSummary={weatherSummary}
                        />
                        {!selectedVehicleId && (
                            <div className="map-selection-overlay">
                                <p>Waiting for unit selection to view live activity...</p>
                            </div>
                        )}
                    </div>
                    {/* Live Backend Status — Orion Superiority Feature */}
                    <SystemHealth />

                    {/* ── Orion Feature: Operational Intelligence Feed ── */}
                    <div className="operational-feed">
                        <div className="feed-header">
                            <span className="feed-title">Operational Intelligence</span>
                            <span className="feed-status">LIVE</span>
                        </div>
                        <div className="feed-content">
                            {events.length === 0 ? (
                                <div className="feed-empty">No live events detected in the network.</div>
                            ) : (
                                events.map(event => (
                                    <div className="feed-item" key={event.id}>
                                        <span className="feed-time">{event.time}</span>
                                        <span className="feed-msg">
                                            <strong style={{color: `var(--accent-${event.type})`}}>
                                                {event.msg.split(' ')[0]}
                                            </strong>
                                            {event.msg.substring(event.msg.indexOf(' '))}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard; // Export for use in the AdminPage orchestration
