import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchStreetRoute } from '../logic/streetRouting';
import { getFleetColor } from '../utils/colors';
import './RouteMap.css';

// Helper component to handle map movement without re-mounting the whole MapContainer
const MapController = ({ coords }) => {
    const map = useMap();

    React.useEffect(() => {
        if (!coords || coords.length === 0) return;

        // Use a timeout to ensure container dimensions are final
        const timer = setTimeout(() => {
            map.invalidateSize();

            if (coords.length === 1) {
                map.setView(coords[0], 14, { animate: true });
            } else {
                const bounds = L.latLngBounds(coords);
                map.fitBounds(bounds, {
                    padding: [50, 50], // Standard uniform padding
                    maxZoom: 14,
                    animate: true
                });
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [JSON.stringify(coords), map]);

    return null;
};

const createAddressLabelIcon = (number, label, isSpecial = false, color = '#000') => new L.DivIcon({
    className: 'address-label-marker',
    html: `
        <div style="display: flex; align-items: center; border: 2px solid #000; background: #fff; padding: 4px 8px; gap: 8px; min-width: 120px; box-shadow: 4px 4px 0 rgba(0,0,0,0.1);">
            <div style="background: #000; color: #fff; padding: 2px 6px; font-size: 10px; font-weight: 900; font-family: 'JetBrains Mono';">
                ${number}
            </div>
            <div style="font-size: 9px; font-weight: 800; font-family: 'JetBrains Mono'; text-transform: uppercase; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${label}
            </div>
        </div>
    `,
    iconSize: [160, 32],
    iconAnchor: [80, 16]
});

const RouteMap = ({ stops = [], unassignedOrders = [] }) => {
    const validStops = (stops || []).filter(o => o && typeof o.lat === 'number' && typeof o.lng === 'number');
    const stopIds = new Set(validStops.map(s => s.id));
    const extraPins = (unassignedOrders || []).filter(o => o && typeof o.lat === 'number' && typeof o.lng === 'number' && !stopIds.has(o.id) && o.status === 'Pending');

    const validCoords = validStops.map(o => [o.lat, o.lng]);
    const allCoords = [...validCoords, ...extraPins.map(p => [p.lat, p.lng])];

    const [fleetPaths, setFleetPaths] = React.useState({});
    const [previewPath, setPreviewPath] = React.useState([]);

    React.useEffect(() => {
        if (validStops.length === 0) { setFleetPaths({}); return; }
        const fetchPaths = async () => {
            const groups = {};
            validStops.forEach(s => {
                const fid = s.driverId || 'unassigned';
                if (!groups[fid]) groups[fid] = [];
                groups[fid].push([s.lat, s.lng]);
            });
            const newPaths = {};
            for (const fid in groups) {
                if (groups[fid].length >= 2) {
                    const result = await fetchStreetRoute(groups[fid]);
                    newPaths[fid] = result.path;
                } else { newPaths[fid] = groups[fid]; }
            }
            setFleetPaths(newPaths);
        };
        fetchPaths();
    }, [JSON.stringify(validStops)]);

    React.useEffect(() => {
        if (validStops.length > 0) { if (previewPath.length > 0) setPreviewPath([]); return; }
        const allPins = (unassignedOrders || []).filter(o => o && typeof o.lat === 'number' && typeof o.lng === 'number');
        if (allPins.length < 2) { setPreviewPath([]); return; }
        const fetchPreview = async () => {
            const coords = allPins.map(o => [o.lat, o.lng]);
            const result = await fetchStreetRoute(coords);
            setPreviewPath(result.path || coords);
        };
        fetchPreview();
    }, [JSON.stringify(validStops), JSON.stringify(unassignedOrders)]);

    if (validStops.length === 0 && extraPins.length === 0) {
        return <div className="route-map-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>[ERR] NO_ROUTE_DATA</div>;
    }

    const centerPosition = allCoords.length > 0 ? allCoords[0] : [13.0827, 80.2707];

    return (
        <div className="route-map-wrapper">
            <MapContainer center={centerPosition} zoom={13} scrollWheelZoom={true} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                <MapController coords={allCoords} />
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                
                {previewPath.length >= 2 && (
                    <Polyline positions={previewPath} pathOptions={{ color: '#000', weight: 4, opacity: 0.4, dashArray: '10, 10' }} />
                )}

                {Object.entries(fleetPaths).map(([fid, path]) => (
                    <Polyline key={`path-${fid}`} positions={path} pathOptions={{ color: '#000', weight: 6, opacity: 0.9, dashArray: fid === 'unassigned' ? '12, 12' : null }} />
                ))}

                {extraPins.map((pin) => (
                    <Marker key={`pin-${pin.id}`} position={[pin.lat, pin.lng]} icon={new L.DivIcon({
                        className: 'unassigned-pin',
                        html: `<div style="width: 8px; height: 8px; background: #fff; border: 2px solid #000; border-radius: 50%;"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })} />
                ))}

                {(() => {
                    const counters = {};
                    return validStops.map((stop, index) => {
                        const fid = stop.driverId || 'unassigned';
                        if (!counters[fid]) counters[fid] = 0;
                        counters[fid]++;
                        const labelNumber = counters[fid];
                        const stopLabel = stop.customer || stop.name || `PT_${labelNumber}`;
                        const displayText = fid !== 'unassigned' ? `${fid}:${stopLabel}` : stopLabel;
                        return (
                            <Marker key={`${stop.id}-${index}`} position={[stop.lat, stop.lng]} icon={createAddressLabelIcon(labelNumber, displayText)} />
                        );
                    });
                })()}
            </MapContainer>
        </div>
    );
};

export default RouteMap;
