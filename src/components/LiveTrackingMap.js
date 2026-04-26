import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchStreetRoute, reverseGeocode } from '../logic/streetRouting';
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

// Custom technical monochrome moving vehicle icon
const dynamicIcon = (isNavigating, iconRotOnScreen) => L.divIcon({
    className: 'custom-nav-icon',
    html: `
        <div style="transform: rotate(${iconRotOnScreen}deg); filter: drop-shadow(0 0 5px rgba(0,0,0,0.2));">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="white" stroke="black" stroke-width="2"/>
                <path d="M20 8L30 30L20 24L10 30L20 8Z" fill="black"/>
            </svg>
            <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; border: 2px solid black; animation: marker-pulse 2s infinite;"></div>
        </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

// Custom Technical Stop Marker
const createGlowingStopIcon = (label, color = '#000') => new L.DivIcon({
    className: 'custom-glowing-stop',
    html: `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; background: #000; border: 2px solid #fff; box-shadow: 0 0 0 2px #000;"></div>
            <div style="background: #000; color: #fff; padding: 2px 8px; font-size: 9px; font-weight: 900; font-family: 'JetBrains Mono'; white-space: nowrap; border: 1px solid #000;">
                ${label.toUpperCase()}
            </div>
        </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [6, 6]
});

const LiveTrackingMap = ({ routeCoordinates = [], isNavigating = false, onNavUpdate, liveLocation, stops = [], color = '#000000' }) => {
    const isUsingRealGPS = !!liveLocation;
    const routeCoordsKey = useMemo(() => JSON.stringify(routeCoordinates), [routeCoordinates]);
    const validCoords = React.useMemo(() => (routeCoordinates || []).filter(c => Array.isArray(c) && c.length >= 2), [routeCoordsKey]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [simulatedPos, setSimulatedPos] = useState(validCoords[0] || [13.0827, 80.2707]);
    const [streetPath, setStreetPath] = useState([]);
    const [navSteps, setNavSteps] = useState([]);

    const coordKey = useMemo(() => validCoords.length ? `${validCoords.length}|${validCoords[0]}|${validCoords[validCoords.length - 1]}` : '', [validCoords]);
    const pathArray = useMemo(() => streetPath.length > 0 ? streetPath : validCoords, [streetPath, validCoords]);
    const vehiclePos = isUsingRealGPS ? [liveLocation.lat, liveLocation.lng] : (pathArray[currentIndex] || simulatedPos);
    const [heading, setHeading] = useState(0);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [currentDistToTurn, setCurrentDistToTurn] = useState(1000);
    const [currentStreet, setCurrentStreet] = useState('');
    const prevLocRef = React.useRef(null);

    useEffect(() => {
        if (isNavigating && vehiclePos) {
            const timer = setTimeout(async () => {
                const street = await reverseGeocode(vehiclePos[0], vehiclePos[1]);
                setCurrentStreet(street);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isNavigating, JSON.stringify(vehiclePos)]);

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
    }, [coordKey]);

    useEffect(() => {
        if (isUsingRealGPS || pathArray.length === 0) return;
        const interval = setInterval(() => setCurrentIndex((prevIndex) => (prevIndex + 1) % pathArray.length), 800);
        return () => clearInterval(interval);
    }, [isUsingRealGPS, pathArray]);

    useEffect(() => {
        if (!isUsingRealGPS || pathArray.length === 0 || !liveLocation) return;
        let closestIndex = 0;
        let minDistance = Infinity;
        for (let i = 0; i < pathArray.length; i++) {
            const p = pathArray[i];
            const d = Math.pow(p[0] - liveLocation.lat, 2) + Math.pow(p[1] - liveLocation.lng, 2);
            if (d < minDistance) { minDistance = d; closestIndex = i; }
        }
        if (minDistance > Math.pow(0.0005, 2) && !isRecalculating && isNavigating && routeCoordinates.length > 1) {
            setIsRecalculating(true);
            const triggerRecalc = async () => {
                const stopsToVisit = routeCoordinates.slice(1);
                if (stopsToVisit.length === 0) { setIsRecalculating(false); return; }
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
            if (Math.sqrt(dy * dy + dx * dx) > 0.00005) { setHeading((Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360); prevLocRef.current = liveLocation; }
        } else { prevLocRef.current = liveLocation; }
    }, [liveLocation, isUsingRealGPS, pathArray, isNavigating]);

    useEffect(() => {
        const pathArray = streetPath.length > 0 ? streetPath : validCoords;
        if (pathArray.length === 0) return;
        const newPos = pathArray[currentIndex];
        const prevIndex = currentIndex === 0 ? pathArray.length - 1 : currentIndex - 1;
        const currentPos = pathArray[prevIndex];
        if (!isUsingRealGPS && currentPos && newPos) {
            const lat1 = currentPos[0] * (Math.PI / 180);
            const lng1 = currentPos[1] * (Math.PI / 180);
            const lat2 = newPos[0] * (Math.PI / 180);
            const lng2 = newPos[1] * (Math.PI / 180);
            const dLng = lng2 - lng1;
            const y = Math.sin(dLng) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
            setHeading((Math.atan2(y, x) * (180 / Math.PI) + 360) % 360 - 90);
            setSimulatedPos(newPos);
        }
        if (onNavUpdate && navSteps.length > 0) {
            let minStepDist = Infinity;
            let targetStep = navSteps[0];
            navSteps.forEach(s => {
                const d = Math.sqrt(Math.pow(s.location[0] - newPos[0], 2) + Math.pow(s.location[1] - newPos[1], 2));
                const distMeters = d * 111320;
                if (distMeters < minStepDist && distMeters > 5) { minStepDist = distMeters; targetStep = s; }
            });
            if (targetStep) { onNavUpdate({ instruction: targetStep.instruction, distance: minStepDist }); setCurrentDistToTurn(minStepDist); }
        }
    }, [currentIndex, streetPath, validCoords, navSteps, onNavUpdate, isUsingRealGPS]);

    if (validCoords.length === 0) return <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>[ERR] NO_GPS_DATA</div>;

    const mapRotValue = isNavigating ? (heading - 90) : 0;
    const iconRotOnScreen = -mapRotValue;

    return (
        <div className={`tracking-map-container ${isNavigating ? 'navigating-3d' : ''}`} style={{ '--map-rotation': `${mapRotValue}deg` }}>
            <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: '#000', color: '#fff', padding: '4px 12px', fontSize: '9px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #fff' }}>
                    <div style={{ width: '6px', height: '6px', background: isRecalculating ? '#f00' : (isUsingRealGPS ? '#fff' : '#666'), borderRadius: '50%' }}></div>
                    {isRecalculating ? 'REROUTING...' : (isUsingRealGPS ? 'LIVE_GPS_ACTIVE' : 'SIMULATION_MODE')}
                </div>
                {isNavigating && currentStreet && (
                    <div style={{ background: '#fff', color: '#000', padding: '4px 12px', fontSize: '9px', fontWeight: 900, border: '1px solid #000' }}>
                        CURRENT_LOC: {currentStreet.toUpperCase()}
                    </div>
                )}
            </div>

            <MapContainer center={vehiclePos} zoom={14} scrollWheelZoom={true} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapController position={vehiclePos} isNavigating={isNavigating} allCoords={validCoords} distToTurn={currentDistToTurn} />
                <Polyline positions={streetPath.length > 0 ? streetPath : validCoords} pathOptions={{ color: '#000', weight: 6, opacity: 0.8 }} />
                {validCoords.map((stop, i) => {
                    if (isUsingRealGPS && i === 0) return null;
                    const stopIndex = isUsingRealGPS ? i - 1 : i;
                    const label = stops[stopIndex]?.customer || stops[stopIndex]?.label || `STOP_${i + 1}`;
                    return <Marker key={i} position={stop} icon={createGlowingStopIcon(label)} />;
                })}
                <Marker position={vehiclePos} icon={dynamicIcon(isNavigating, iconRotOnScreen)} />
            </MapContainer>
        </div>
    );
};

export default LiveTrackingMap;
