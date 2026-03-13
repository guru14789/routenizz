import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchStreetRoute } from '../logic/streetRouting';
import './LiveTrackingMap.css';

// Fix for default marker icons in Vite/React environment
const DefaultIcon = L.icon({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom futuristic glowing moving vehicle icon
const vehicleIcon = new L.DivIcon({
    className: 'custom-nav-icon',
    html: `
        <div style="width: 40px; height: 40px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 0 10px #00f2fe);">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 4L28 28L16 22L4 28L16 4Z" fill="#00f2fe" stroke="#ffffff" stroke-width="2"/>
            </svg>
        </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
});

// Custom Glowing Stop Marker with Label
const createGlowingStopIcon = (label) => new L.DivIcon({
    className: 'custom-glowing-stop',
    html: `
        <div class="glowing-stop-wrapper">
            <div class="pulse-ring"></div>
            <div class="stop-core"></div>
            <div class="stop-label">${label}</div>
        </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const MapController = ({ position, isNavigating, allCoords, distToTurn = 1000 }) => {
    const map = useMap();
    useEffect(() => {
        if (!allCoords || allCoords.length === 0) return;

        const timer = setTimeout(() => {
            map.invalidateSize();
            if (isNavigating) {
                if (position) {
                    // Google Maps Style: Zoom in as you approach turn
                    const targetZoom = distToTurn < 100 ? 18.5 : distToTurn < 500 ? 17.5 : 16.5;

                    // PERSISTENT AUTO-CENTER: Lock the vehicle position in the center
                    map.setView(position, targetZoom, {
                        animate: true,
                        duration: 0.5, // Faster snap
                        easeLinearity: 0.25
                    });
                }
            } else {
                // Overview Mode: Keep all stops in view
                const bounds = L.latLngBounds(allCoords);
                map.fitBounds(bounds, {
                    padding: [80, 80],
                    maxZoom: 14,
                    animate: true
                });
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [position, isNavigating, JSON.stringify(allCoords), map, distToTurn]);

    return null;
};

const LiveTrackingMap = ({ routeCoordinates = [], isNavigating = false, onNavUpdate, liveLocation, stops = [] }) => {
    const isUsingRealGPS = !!liveLocation;

    // Stable key for routeCoordinates - avoids JSON.stringify on every render
    const routeCoordsKey = `${routeCoordinates.length}|${routeCoordinates[0]}|${routeCoordinates[routeCoordinates.length - 1]}`;

    // Memoize the derived coordinates to prevent infinite update cycles
    const validCoords = React.useMemo(() => (routeCoordinates || []).filter(c =>
        Array.isArray(c) &&
        c.length >= 2 &&
        typeof c[0] === 'number' && !isNaN(c[0]) &&
        typeof c[1] === 'number' && !isNaN(c[1])
    ), [routeCoordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const [currentIndex, setCurrentIndex] = useState(0);
    const [simulatedPos, setSimulatedPos] = useState(validCoords[0] || [13.0827, 80.2707]);
    const [streetPath, setStreetPath] = useState([]);
    const [navSteps, setNavSteps] = useState([]);

    // Stable key: only recomputes street path when boundary coords change
    const coordKey = useMemo(() => {
        if (!validCoords.length) return '';
        return `${validCoords.length}|${validCoords[0]}|${validCoords[validCoords.length - 1]}`;
    }, [validCoords]);

    // Safety check for empty path
    const pathArray = useMemo(() => streetPath.length > 0 ? streetPath : validCoords, [streetPath, validCoords]);
    const vehiclePos = isUsingRealGPS ? [liveLocation.lat, liveLocation.lng] : (pathArray[currentIndex] || simulatedPos);
    const [heading, setHeading] = useState(0);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [currentDistToTurn, setCurrentDistToTurn] = useState(1000);
    const prevLocRef = React.useRef(null);

    useEffect(() => {
        setCurrentIndex(0);
        setSimulatedPos(validCoords[0]);

        const getStreetPath = async () => {
            const coords = validCoords.map(stop => [stop[0], stop[1]]);
            const result = await fetchStreetRoute(coords);
            setStreetPath(result.path || validCoords);
            setNavSteps(result.steps || []);
        };
        getStreetPath();
    }, [coordKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Simulate smoother movement ONLY in simulation mode
    useEffect(() => {
        if (isUsingRealGPS || pathArray.length === 0) return;

        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % pathArray.length);
        }, streetPath.length > 0 ? 800 : 2000);

        return () => clearInterval(interval);
    }, [isUsingRealGPS, streetPath, validCoords, pathArray]);

    // Real-World Snapping & GPS Heading Calculation
    useEffect(() => {
        if (!isUsingRealGPS || pathArray.length === 0 || !liveLocation) return;

        // Find index of the point on path closest to user's real coordinate
        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < pathArray.length; i++) {
            const p = pathArray[i];
            const d = Math.pow(p[0] - liveLocation.lat, 2) + Math.pow(p[1] - liveLocation.lng, 2);
            if (d < minDistance) {
                minDistance = d;
                closestIndex = i;
            }
        }

        // Deviation check for Auto-Recalculation (Dist > ~50m)
        // 0.0005 deg is roughly 55 meters
        if (minDistance > Math.pow(0.0005, 2) && !isRecalculating && isNavigating && routeCoordinates.length > 1) {
            console.warn("Off route detected. Recalculating...");
            setIsRecalculating(true);
            const triggerRecalc = async () => {
                // Determine remaining stops from the current point
                // We slice starting from the next planned stop in the sequence
                const stopsToVisit = routeCoordinates.slice(1);
                if (stopsToVisit.length === 0) {
                    setIsRecalculating(false);
                    return;
                }
                const result = await fetchStreetRoute([[liveLocation.lat, liveLocation.lng], ...stopsToVisit]);
                setStreetPath(result.path || []);
                setNavSteps(result.steps || []);
                setIsRecalculating(false);
            };
            triggerRecalc();
        }

        setCurrentIndex(closestIndex);

        if (prevLocRef.current) {
            const dy = liveLocation.lat - prevLocRef.current.lat;
            const dx = liveLocation.lng - prevLocRef.current.lng;
            const dist = Math.sqrt(dy * dy + dx * dx);

            if (dist > 0.00005) { // Roughly ~5-10m movement threshold
                const angle = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
                setHeading(angle);
                prevLocRef.current = liveLocation;
            }
        } else {
            prevLocRef.current = liveLocation;
        }
    }, [liveLocation, isUsingRealGPS, pathArray, isNavigating]); // isNavigating added: controls reroute trigger

    // Handle physics and side effects of index changes safely
    useEffect(() => {
        const pathArray = streetPath.length > 0 ? streetPath : validCoords;
        if (pathArray.length === 0) return;

        const newPos = pathArray[currentIndex];
        const prevIndex = currentIndex === 0 ? pathArray.length - 1 : currentIndex - 1;
        const currentPos = pathArray[prevIndex];

        // Only update heading from path if we are NOT using Real GPS (Simulation mode)
        if (!isUsingRealGPS && currentPos && newPos) {
            const lat1 = currentPos[0] * (Math.PI / 180);
            const lng1 = currentPos[1] * (Math.PI / 180);
            const lat2 = newPos[0] * (Math.PI / 180);
            const lng2 = newPos[1] * (Math.PI / 180);

            const dLng = lng2 - lng1;
            const y = Math.sin(dLng) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
            const angle = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
            setHeading(angle - 90);
        }

        if (!isUsingRealGPS) {
            setSimulatedPos(newPos);
        }

        // Proximity Navigation: Find distance to the upcoming turn
        if (onNavUpdate && navSteps.length > 0) {
            // Find upcoming navigation step by finding the one closest to current position
            // (the dead find() that always returned step[0] has been removed)
            let minStepDist = Infinity;
            let targetStep = navSteps[0];

            navSteps.forEach(s => {
                const d = Math.sqrt(Math.pow(s.location[0] - newPos[0], 2) + Math.pow(s.location[1] - newPos[1], 2));
                // OSRM degrees to meters (approx)
                const distMeters = d * 111320;

                // We want the closest step that is significantly AHEAD of us or just reached
                if (distMeters < minStepDist && distMeters > 5) {
                    minStepDist = distMeters;
                    targetStep = s;
                }
            });

            if (targetStep) {
                onNavUpdate({
                    instruction: targetStep.instruction,
                    distance: minStepDist
                });
                setCurrentDistToTurn(minStepDist);
            }
        }
    }, [currentIndex, streetPath, validCoords, navSteps, onNavUpdate, isUsingRealGPS, isNavigating, liveLocation]);

    if (validCoords.length === 0) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>No valid GPS coordinates for tracking.</div>;
    }

    // mapRotValue: The angle to rotate the map container.
    // If heading=90 (North), mapRotValue=0. If heading=0 (East), mapRotValue=-90.
    const mapRotValue = isNavigating ? (heading - 90) : 0;
    // iconRotOnScreen: The angle to rotate the marker relative to the rotated map.
    // We want the icon to always point UP (final angle 0 on screen).
    // Net_Rot = mapRotValue + iconRotOnScreen = 0.
    const iconRotOnScreen = -mapRotValue;

    const dynamicIcon = L.divIcon({
        className: 'custom-nav-icon',
        html: `<div style="transform: rotate(${iconRotOnScreen}deg); width: 40px; height: 40px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16 2L30 30L16 23.5L2 30L16 2Z" fill="${isNavigating ? '#101828' : '#00f2fe'}" stroke="white" stroke-width="1.8"/>
                  </svg>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });

    return (
        <div
            className={`tracking-map-container ${isNavigating ? 'navigating-3d' : ''}`}
            style={{ '--map-rotation': `${mapRotValue}deg` }}
        >
            {/* Visual Status Overlay */}
            <div className="tracking-overlay">
                <div className="tracking-status">
                    <div className={isRecalculating ? 'gps-pulse-denied' : (isUsingRealGPS ? 'gps-pulse-active' : 'gps-pulse-sim')}></div>
                    <span>{isRecalculating ? 'REROUTING...' : (isUsingRealGPS ? 'LIVE GPS ACTIVE' : 'DEV SIMULATION MODE')}</span>
                </div>
            </div>

            <MapContainer
                center={vehiclePos}
                zoom={14}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                <MapController
                    position={vehiclePos}
                    isNavigating={isNavigating}
                    allCoords={validCoords}
                    distToTurn={currentDistToTurn}
                />

                <Polyline
                    positions={streetPath.length > 0 ? streetPath : validCoords}
                    pathOptions={{ color: '#000000', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
                />

                {/* Destination Markers */}
                {validCoords.map((stop, i) => {
                    // Logic: If we have liveLocation, index 0 is the vehicle. Skip its "numbered stop" marker
                    const isVehicleStart = !!liveLocation && i === 0;
                    if (isVehicleStart) return null;

                    // Get metadata from the 'stops' array
                    // If liveLocation is present, validCoords[1] corresponds to stops[0]
                    const stopIndex = liveLocation ? i - 1 : i;
                    const stopData = stops[stopIndex];

                    // Use customer name as label, fallback to "Stop N"
                    const label = stopData?.customer || stopData?.label || `Stop ${liveLocation ? i : i + 1}`;

                    return (
                        <Marker key={i} position={stop} icon={createGlowingStopIcon(label)}>
                            <Popup className="futuristic-popup">
                                <div className="stop-popup">
                                    <strong>{label}</strong>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {/* Actual Vehicle/Chevron Position */}
                <Marker position={vehiclePos} icon={dynamicIcon}>
                    <Popup>Current Location Simulator</Popup>
                </Marker>
            </MapContainer>
        </div>
    );
};

export default LiveTrackingMap;
