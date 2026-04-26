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
        <div class="map-label-wrapper ${isSpecial ? 'special-label' : ''}" style="border-left: 5px solid ${color}">
            <div class="label-badge" style="background-color: ${color}">#${number}</div>
            <div class="label-info">
                <span class="label-text">${label}</span>
            </div>
        </div>
    `,
    iconSize: [160, 45],
    iconAnchor: [80, 51] // 45px container + 6px downward offset for the pointer arrow tip
});

const RouteMap = ({ stops = [], unassignedOrders = [] }) => {
    // Safety Filter: Ensure we only pass valid numeric pairs to Leaflet
    const validStops = (stops || []).filter(o =>
        o && typeof o.lat === 'number' && typeof o.lng === 'number'
    );

    // Filter unassigned orders that aren't already in the sequence
    const stopIds = new Set(validStops.map(s => s.id));
    const extraPins = (unassignedOrders || []).filter(o =>
        o && typeof o.lat === 'number' && typeof o.lng === 'number' && !stopIds.has(o.id) && o.status === 'Pending'
    );

    const validCoords = validStops.map(o => [o.lat, o.lng]);
    const allCoords = [...validCoords, ...extraPins.map(p => [p.lat, p.lng])];

    const [fleetPaths, setFleetPaths] = React.useState({});
    const [previewPath, setPreviewPath] = React.useState([]);


    // Fetch optimized street paths for each driver group
    React.useEffect(() => {
        if (validStops.length === 0) {
            setFleetPaths({});
            return;
        }

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
                } else {
                    newPaths[fid] = groups[fid];
                }
            }
            setFleetPaths(newPaths);
        };
        fetchPaths();
    }, [JSON.stringify(validStops)]);

    // When no optimized route exists yet, fetch a preview street path through all visible order pins
    React.useEffect(() => {
        if (validStops.length > 0) {
            // Optimized route takes priority — clear preview immediately to avoid 'blue flicker'
            if (previewPath.length > 0) setPreviewPath([]);
            return;
        }
        const allPins = (unassignedOrders || []).filter(
            o => o && typeof o.lat === 'number' && typeof o.lng === 'number'
        );
        if (allPins.length < 2) {
            setPreviewPath([]);
            return;
        }
        const fetchPreview = async () => {
            const coords = allPins.map(o => [o.lat, o.lng]);
            const result = await fetchStreetRoute(coords);
            setPreviewPath(result.path || coords);
        };
        fetchPreview();
    }, [JSON.stringify(validStops), JSON.stringify(unassignedOrders)]);

    if (validStops.length === 0 && extraPins.length === 0) {
        return <div className="route-map-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Valid Route Data Available</div>;
    }

    const centerPosition = allCoords.length > 0 ? allCoords[0] : [13.0827, 80.2707];

    return (
        <div className="route-map-wrapper">
            <MapContainer
                center={centerPosition}
                zoom={13}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
            >
                <MapController coords={allCoords} />

                {/* Grayscale CartoDB Positron for the monochromatic look */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                />

                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                    opacity={0.6}
                />

                {/* Preview dashed route: shown before optimization runs (when route[] is empty) */}
                {previewPath.length >= 2 && (
                    <Polyline
                        key="preview-path"
                        positions={previewPath}
                        pathOptions={{
                            color: '#00f2fe', // Electric Cyan (No Grey)
                            weight: 4,
                            opacity: 0.6,
                            lineCap: 'round',
                            lineJoin: 'round',
                            dashArray: '10, 10'
                        }}
                    />
                )}

                {/* Optimized fleet routes: solid colored lines per driver */}
                {Object.entries(fleetPaths).map(([fid, path]) => (
                    <Polyline
                        key={`path-${fid}`}
                        positions={path}
                        pathOptions={{
                            color: getFleetColor(fid),
                            weight: 7, // Thicker lines for better visibility
                            opacity: 0.9,
                            lineCap: 'round',
                            lineJoin: 'round',
                            dashArray: fid === 'unassigned' ? '12, 12' : null
                        }}
                    />
                ))}

                {/* Draw unassigned orders as subtle pins */}
                {extraPins.map((pin) => (
                    <Marker
                        key={`pin-${pin.id}`}
                        position={[pin.lat, pin.lng]}
                        icon={new L.DivIcon({
                            className: 'unassigned-pin',
                            html: `<div class="pin-dot"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        })}
                    >
                        <Popup>
                            <strong>{pin.customer}</strong><br />
                            Status: Pending (Unoptimized)
                        </Popup>
                    </Marker>
                ))}

                {/* Draw custom address labels for route stops */}
                {(() => {
                    const counters = {}; // Local counters per fleet
                    return validStops.map((stop, index) => {
                        const fid = stop.driverId || 'unassigned';
                        if (!counters[fid]) counters[fid] = 0;
                        counters[fid]++;

                        const fleetColor = getFleetColor(fid);
                        const labelNumber = counters[fid];

                        // Premium Labeling: Fleet ID + Customer Name
                        const stopLabel = stop.customer || stop.name || `Point ${labelNumber}`;
                        const displayText = fid !== 'unassigned' ? `[${fid}] ${stopLabel}` : stopLabel;

                        const isDepot = index === 0 || stop.status === 'Depot' || String(stop.id).startsWith('HQ');

                        return (
                            <Marker
                                key={`${stop.id}-${index}`}
                                position={[stop.lat, stop.lng]}
                                icon={createAddressLabelIcon(
                                    labelNumber,
                                    displayText,
                                    isDepot,
                                    fleetColor
                                )}
                            />
                        );
                    });
                })()}
            </MapContainer>
        </div>
    );
};

export default RouteMap;
