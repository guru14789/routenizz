/**
 * USES: Operational interface for field drivers.
 * SUPPORT: Displays the assigned route, provides turn-by-turn stop details, and handles the completion workflow for individual deliveries.
 */
import React, { useState, useMemo, useEffect } from 'react';

import LiveTrackingMap from './LiveTrackingMap';
import { getFleetColor } from '../utils/colors';
import { reverseGeocode } from '../logic/streetRouting';
import './DriverView.css';

const DriverIcons = {
    Connectivity: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
    ),
    GPS: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ),
    Fuel: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 22V2h11v11h2V2h4v7" />
            <path d="M7 22v-4" />
            <path d="M11 22v-4" />
            <path d="M14 13h4v11" />
            <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    ),
    Navigation: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
    ),
    Warning: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    Success: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    ArrowLeft: () => (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
    ),
    ArrowRight: () => (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 14 20 9 15 4" />
            <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
        </svg>
    ),
    ArrowStraight: () => (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
        </svg>
    ),
    Logout: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    )
};

const DriverView = ({
    route = [],
    currentStopIndex: globalIndex,
    setCurrentStopIndex: setGlobalIndex,
    routeStatus,
    setRouteStatus,
    delayMinutes,
    setDelayMinutes,
    recalculateRoute,
    liveLocation,
    gpsStatus,
    onComplete,
    onToggleRole,
    onLogout,
    driverId,
    onCycleFleet,
    trafficMultiplier
}) => {
    const [fuel, setFuel] = useState(100);
    const [isLoading, setIsLoading] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isPanelExpanded, setIsPanelExpanded] = useState(true);
    const [navStep, setNavStep] = useState({ instruction: '', distance: 0 });
    const [currentStreet, setCurrentStreet] = useState('Detecting Street...');

    // Effect to fetch real-time street name for navigation accuracy
    useEffect(() => {
        if (liveLocation && isNavigating) {
            const timer = setTimeout(async () => {
                const street = await reverseGeocode(liveLocation.lat, liveLocation.lng);
                setCurrentStreet(street);
            }, 2000); // Debounce to avoid hitting Nominatim too hard
            return () => clearTimeout(timer);
        }
    }, [liveLocation, isNavigating]);

    // Derive current stop index from completed orders in the filtered route.
    // Filter out HQ synthetic depot stops (HQ-START-*, HQ-RETURN-*) — drivers only see real deliveries.
    const deliveryRoute = useMemo(
        () => route.filter(o => !String(o.id).startsWith('HQ')),
        [route]
    );

    const currentStopIndex = deliveryRoute.findIndex(o => o.status === 'Pending');
    const effectiveIndex = currentStopIndex === -1 ? deliveryRoute.length : currentStopIndex;

    const currentStop = deliveryRoute[effectiveIndex];
    const nextStop = deliveryRoute[effectiveIndex + 1];
    const isFinished = deliveryRoute.length > 0 && effectiveIndex >= deliveryRoute.length;
    const progress = deliveryRoute.length > 0 ? Math.round((effectiveIndex / deliveryRoute.length) * 100) : 0;

    // Fuel: derive from route completion ratio (starts 100%, depletes to ~10% by end of route)
    const completedCount = deliveryRoute.filter(o => o.status === 'Completed').length;
    const fuelPercent = deliveryRoute.length > 0
        ? Math.max(10, Math.round(100 - (completedCount / deliveryRoute.length) * 90))
        : 100;

    // ETA: compute from current stop's cumulative travel time (minutes from route start)
    const etaDisplay = useMemo(() => {
        if (!currentStop?.arrivalTime) return '—';
        // ETA = Current Time + Planned Arrival Time + Current Simulation Delay
        return new Date(Date.now() + (currentStop.arrivalTime + delayMinutes) * 60000)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [currentStop?.id, currentStop?.arrivalTime]);

    const handleReportDelay = async () => {
        setIsLoading(true);
        setDelayMinutes(prev => prev + 10);
        setRouteStatus('Delayed');
        try {
            await recalculateRoute(); // Wait for real optimization to finish
        } finally {
            setIsLoading(false); // Always clears regardless of success or error
        }
    };

    const handleComplete = () => {
        if (!isFinished && currentStop && onComplete) {
            setFuel(prev => Math.max(0, prev - 8));
            onComplete(currentStop.id);
        }
    };

    // Stable memo: derives map coordinates from route.
    // Separates the JSON.stringify cost into its own memo so it doesn't re-run the expensive computation.
    const routeKey = useMemo(
        () => route.map(s => `${s.lat},${s.lng}`).join('|'),
        [route]
    );
    const snappedLat = liveLocation ? Math.round(liveLocation.lat * 10000) : null;
    const snappedLng = liveLocation ? Math.round(liveLocation.lng * 10000) : null;

    const extractedRouteCoordinates = useMemo(() => {
        const coords = route.map(stop => [stop.lat, stop.lng]);
        if (liveLocation && snappedLat !== null) {
            return [[snappedLat / 10000, snappedLng / 10000], ...coords];
        }
        return coords;
    }, [routeKey, snappedLat, snappedLng]); // eslint-disable-line react-hooks/exhaustive-deps

    if (deliveryRoute.length === 0) {
        return (
            <div className="driver-redesigned-screen empty-state-view">
                {/* Animated Background Layer */}
                <div className="premium-mesh-bg"></div>
                
                {/* Glassmorphic Command Terminal */}
                <div className="glass-terminal">
                    <div className="terminal-header">
                        <div className="logo-orb">
                            <span className="logo-letter">R</span>
                            <div className="orb-glow"></div>
                        </div>
                        <div className="terminal-meta">
                            <span className="version">V2.4.0 ENCRYPTION ACTIVE</span>
                            <span className="driver-tag">ID: {driverId || 'FLEET-UNASSIGNED'}</span>
                        </div>
                    </div>

                    <div className="terminal-body">
                        <div className="holographic-loader">
                            <div className="ring outer"></div>
                            <div className="ring middle"></div>
                            <div className="ring inner"></div>
                            <div className="status-dot"></div>
                        </div>
                        
                        <div className="message-stack">
                            <h1 className="hero-status">Awaiting Dispatch</h1>
                            <p className="sub-status">Synchronizing with Global Control Center...</p>
                            <div className="typing-log">
                                <span>{">"} INITIALIZING SECURITY HANDSHAKE...</span>
                                <span>{">"} GEOPOSITIONING CALIBRATED</span>
                                <span>{">"} LISTENING FOR OPTIMIZED PAYLOAD</span>
                            </div>
                        </div>
                    </div>

                    <div className="terminal-actions">
                        <button className="btn-premium pulse" onClick={onToggleRole}>
                            <div className="btn-inner">
                                <span className="btn-text">ADMIN OVERRIDE</span>
                                <div className="btn-glare"></div>
                            </div>
                        </button>
                        <button className="btn-ghost" onClick={onLogout}>SYSTEM LOGOUT</button>
                    </div>
                    
                    <div className="terminal-footer">
                        <div className="telemetry-bar">
                            <div className="tele-item">SIGNAL: 98%</div>
                            <div className="tele-item">LATENCY: 14ms</div>
                            <div className="tele-item">UPTIME: 99.9%</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`driver-redesigned-screen ${isNavigating ? 'nav-mode' : ''}`}>
            {/* Top Bar - Status Indicators */}
            <div className="driver-status-bar">
                <div className="branding-mini">
                    <span className="mini-logo">R</span>
                    <div
                        className="driver-telemetry-text"
                        onClick={onCycleFleet}
                        style={onCycleFleet ? { cursor: 'pointer', transition: 'opacity 0.2s' } : {}}
                    >
                        <span className="driver-id">{driverId || route[0]?.driverId || 'D00-SYS'}</span>
                        <div className="gps-status-line">
                            <span className={`gps-pulse ${gpsStatus?.toLowerCase().replace(' ', '-')}`}></span>
                            <span className="gps-text">{gpsStatus?.toUpperCase() || 'GPS ACTIVE'}</span>
                            <span className="gps-accuracy-hint" title="High Precision Mode">±5m</span>
                        </div>
                    </div>
                </div>
                <div className="system-stats">
                    <div className="stat-pill"><DriverIcons.Connectivity /> 5G</div>
                    <div className={`stat-pill traffic ${trafficMultiplier > 1.8 ? 'heavy' : (trafficMultiplier > 1.3 ? 'moderate' : 'clear')}`}>
                        <span className="traffic-val">{trafficMultiplier.toFixed(1)}x</span>
                        <span className="traffic-label">TRAFFIC</span>
                    </div>
                    <div className="stat-pill fuel"><DriverIcons.Fuel /> {fuelPercent}%</div>
                </div>
            </div>

            {/* Background Map View */}
            <div className="driver-viewport-map">
                <LiveTrackingMap
                    routeCoordinates={extractedRouteCoordinates}
                    currentStopIndex={currentStopIndex}
                    isNavigating={isNavigating}
                    onNavUpdate={setNavStep}
                    liveLocation={liveLocation}
                    stops={route}
                    color={getFleetColor(driverId || route[0]?.driverId)}
                />
            </div>

            {/* Navigation Instruction Overlay (Floating Top) */}
            {isNavigating && !isFinished && (
                <div className="floating-nav-panel">
                    <div className="nav-turn-indicator">
                        {navStep.instruction.toLowerCase().includes('left') ? <DriverIcons.ArrowLeft /> :
                            navStep.instruction.toLowerCase().includes('right') ? <DriverIcons.ArrowRight /> :
                                <DriverIcons.ArrowStraight />}
                    </div>
                    <div className="nav-text">
                        <span className="dist">
                            {navStep.distance < 20 ? '✓' : (navStep.distance >= 1000
                                ? `${(navStep.distance / 1000).toFixed(1)} km`
                                : `${Math.round(navStep.distance)} m`)}
                        </span>
                        <h2>{navStep.distance < 20 ? 'You have arrived!' : (navStep.instruction || "Following Optimized Path")}</h2>
                        <div className="nav-next-stop-hint">
                            <span className="label">DESTINATION:</span>
                            <span className="value" style={{ textTransform: 'capitalize' }}>
                                {currentStop?.customer || "Next Gateway"}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Operations Panel (Bottom) */}
            <div className="floating-ops-container">
                <div className={`ops-card ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
                    <div className="ops-drag-handle" onClick={() => setIsPanelExpanded(!isPanelExpanded)}>
                        <div className="drag-pill"></div>
                    </div>
                    <div className="ops-header">
                        <div className="stop-badge">STOP {effectiveIndex + 1} / {deliveryRoute.length}</div>
                        <div className="progress-mini">
                            <div className="bar" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>

                    <div className="main-info">
                        <h1 className="customer-name">
                            {isFinished ? "OPERATIONS COMPLETE" : currentStop?.customer}
                        </h1>
                        <p className="address">
                            {isNavigating ? (
                                <span className="live-street-indicator">
                                    <span className="live-dot"></span> Currently on: <strong>{currentStreet}</strong>
                                </span>
                            ) : (isFinished ? "Awaiting return-to-base clearance" : currentStop?.address)}
                        </p>
                        <div className="card-divider"></div>
                    </div>

                    {!isFinished && (
                        <div className="ops-stats-row">
                            <div className="mini-stat">
                                <label>ETA</label>
                                <span>{etaDisplay}</span>
                            </div>
                            <div className="mini-stat">
                                <label>REMAINING</label>
                                <span>{deliveryRoute.length - effectiveIndex} Stops</span>
                            </div>
                            <div className="mini-stat">
                                <label>DELAY</label>
                                <span className={delayMinutes > 0 ? 'warning' : ''}>+{delayMinutes}m</span>
                            </div>
                        </div>
                    )}

                    <div className="ops-actions">
                        {!isFinished ? (
                            <>
                                <button
                                    className={`action-btn secondary ${isNavigating ? 'active' : ''}`}
                                    onClick={() => setIsNavigating(!isNavigating)}
                                >
                                    <DriverIcons.Navigation /> {isNavigating ? 'Exit Nav' : 'Start Nav'}
                                </button>
                                <button className="action-btn secondary warning" onClick={handleReportDelay}>
                                    <DriverIcons.Warning /> Alert Delay
                                </button>
                                <button className="action-btn primary" onClick={handleComplete}>
                                    <DriverIcons.Success /> Arrived
                                </button>
                            </>
                        ) : (
                            <button className="action-btn primary logout" onClick={onLogout}>
                                <DriverIcons.Logout /> End Shift
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="ops-overlay">
                    <div className="loader"></div>
                    <span>CALCULATING OPTIMAL PATH...</span>
                </div>
            )}
        </div>
    );
};

export default DriverView;
