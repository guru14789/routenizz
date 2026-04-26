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
            <div className="driver-redesigned-screen empty-state-view" style={{ background: '#fff', padding: '32px' }}>
                <div className="analytics-card" style={{ maxWidth: '400px', width: '100%', margin: '0 auto', border: '2px solid #000' }}>
                    <div className="feed-header">
                        <span className="feed-title">TERMINAL_ID: {driverId || 'FLEET-UNASSIGNED'}</span>
                    </div>
                    <div style={{ padding: '32px', textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', fontWeight: 900, marginBottom: '16px' }}>R</div>
                        <h1 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>AWAITING DISPATCH</h1>
                        <p style={{ fontSize: '10px', color: '#666', marginBottom: '24px' }}>SYNCHRONIZING WITH GLOBAL CONTROL CENTER...</p>
                        
                        <div style={{ textAlign: 'left', background: '#000', color: '#fff', padding: '16px', fontSize: '10px', fontFamily: 'JetBrains Mono', marginBottom: '24px' }}>
                            <div>{">"} INITIALIZING HANDSHAKE...</div>
                            <div>{">"} GEOPOSITIONING CALIBRATED</div>
                            <div>{">"} LISTENING FOR PAYLOAD</div>
                        </div>

                        <button className="prime-login-btn" onClick={onToggleRole} style={{ width: '100%' }}>
                            ADMIN OVERRIDE
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`driver-redesigned-screen ${isNavigating ? 'nav-mode' : ''}`} style={{ background: '#fff', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="viewport-header" style={{ height: 'auto', padding: '12px 24px', borderBottom: '2px solid #000', background: '#fff' }}>
                <div className="branding-mini" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="logo-box" style={{ width: '24px', height: '24px', fontSize: '14px' }}>R</div>
                    <div style={{ fontSize: '10px', fontWeight: 800 }}>
                        {driverId || 'D00-SYS'} / {gpsStatus?.toUpperCase() || 'GPS ACTIVE'}
                    </div>
                </div>
                <div className="system-stats" style={{ display: 'flex', gap: '16px' }}>
                    <div className="status-chip" style={{ background: '#000', color: '#fff', padding: '2px 8px', fontSize: '9px' }}>
                        TRAFFIC: {trafficMultiplier.toFixed(1)}x
                    </div>
                    <div className="status-chip" style={{ background: '#000', color: '#fff', padding: '2px 8px', fontSize: '9px' }}>
                        FUEL: {fuelPercent}%
                    </div>
                </div>
            </div>

            <div className="driver-viewport-map" style={{ flex: 1, background: '#eee', position: 'relative' }}>
                <LiveTrackingMap
                    routeCoordinates={extractedRouteCoordinates}
                    currentStopIndex={currentStopIndex}
                    isNavigating={isNavigating}
                    onNavUpdate={setNavStep}
                    liveLocation={liveLocation}
                    stops={route}
                    color="#000"
                />

                {isNavigating && !isFinished && (
                    <div className="analytics-card" style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', border: '2px solid #000', background: '#fff', padding: '16px', zIndex: 1000 }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <div style={{ width: '32px', height: '32px', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {navStep.instruction.toLowerCase().includes('left') ? <DriverIcons.ArrowLeft /> :
                                    navStep.instruction.toLowerCase().includes('right') ? <DriverIcons.ArrowRight /> :
                                        <DriverIcons.ArrowStraight />}
                            </div>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 800 }}>{navStep.instruction || "FOLLOW OPTIMIZED PATH"}</div>
                                <div style={{ fontSize: '10px', color: '#666' }}>{navStep.distance >= 1000 ? `${(navStep.distance / 1000).toFixed(1)} km` : `${Math.round(navStep.distance)} m`} REMAINING</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="floating-ops-container" style={{ padding: '16px', borderTop: '2px solid #000', background: '#fff' }}>
                <div className="ops-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="status-chip" style={{ background: '#000', color: '#fff', padding: '4px 12px', fontSize: '10px', fontWeight: 800 }}>
                        STOP {effectiveIndex + 1} / {deliveryRoute.length}
                    </div>
                    <div style={{ flex: 1, height: '4px', background: '#eee', margin: '0 16px', position: 'relative' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: '#000' }}></div>
                    </div>
                </div>

                <div className="main-info" style={{ marginBottom: '16px' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>
                        {isFinished ? "OPERATIONS COMPLETE" : currentStop?.customer}
                    </h1>
                    <p style={{ fontSize: '10px', color: '#666' }}>
                        {isNavigating ? `CURRENTLY ON: ${currentStreet}` : (isFinished ? "AWAITING RETURN CLEARANCE" : currentStop?.address)}
                    </p>
                </div>

                {!isFinished && (
                    <div className="ops-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#000', border: '1px solid #000', marginBottom: '16px' }}>
                        <div style={{ background: '#fff', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '8px', fontWeight: 800, color: '#666' }}>ETA</div>
                            <div style={{ fontSize: '12px', fontWeight: 800 }}>{etaDisplay}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '8px', fontWeight: 800, color: '#666' }}>REMAINING</div>
                            <div style={{ fontSize: '12px', fontWeight: 800 }}>{deliveryRoute.length - effectiveIndex}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '8px', fontWeight: 800, color: '#666' }}>DELAY</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: delayMinutes > 0 ? '#ff0000' : '#000' }}>+{delayMinutes}m</div>
                        </div>
                    </div>
                )}

                <div className="ops-actions" style={{ display: 'flex', gap: '12px' }}>
                    {!isFinished ? (
                        <>
                            <button className="btn-obsidian" style={{ flex: 1, padding: '16px', fontSize: '10px' }} onClick={() => setIsNavigating(!isNavigating)}>
                                {isNavigating ? 'EXIT NAV' : 'START NAV'}
                            </button>
                            <button className="btn-ghost" style={{ flex: 1, padding: '16px', fontSize: '10px', border: '2px solid #000' }} onClick={handleReportDelay}>
                                REPORT DELAY
                            </button>
                            <button className="btn-obsidian" style={{ flex: 1.5, padding: '16px', fontSize: '12px', background: '#000' }} onClick={handleComplete}>
                                ARRIVED
                            </button>
                        </>
                    ) : (
                        <button className="btn-obsidian" style={{ width: '100%', padding: '20px' }} onClick={onLogout}>
                            END SHIFT
                        </button>
                    )}
                </div>
            </div>

            {isLoading && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <div style={{ marginTop: '16px', fontSize: '10px', fontWeight: 800 }}>CALCULATING OPTIMAL PATH...</div>
                </div>
            )}
        </div>
    );
};

export default DriverView;
