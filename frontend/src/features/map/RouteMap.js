import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchStreetRoute } from '../../shared/logic/streetRouting';
import { getFleetColor } from '../../shared/utils/colors';
import './RouteMap.css';

// ── Weather condition helpers ─────────────────────────────────────────────────
const WEATHER_EMOJI = {
    clear: '☀️', partly_cloudy: '⛅', mist: '🌫️', fog: '🌫️',
    drizzle: '🌦️', heavy_drizzle: '🌧️', rain: '🌧️', showers: '🌦️',
    heavy_showers: '⛈️', thunderstorm: '⛈️', heavy_storm: '🌪️', unknown: '🌡️',
};

const SEVERITY_COLORS = {
    LOW:    { bg: 'rgba(34,197,94,0.15)',  border: '#22c55e', text: '#16a34a' },
    MEDIUM: { bg: 'rgba(251,146,60,0.15)', border: '#fb923c', text: '#ea580c' },
    HIGH:   { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444', text: '#dc2626' },
};

// ── Weather Badge Component ────────────────────────────────────────────────────
const WeatherBadge = ({ weatherSummary }) => {
    if (!weatherSummary) return null;

    const { worst_condition = 'clear', severity = 'LOW', max_multiplier = 1.0, affected_count = 0 } = weatherSummary;
    const emoji = WEATHER_EMOJI[worst_condition] || '🌡️';
    const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;
    const extraEta = Math.round((max_multiplier - 1) * 100);

    return (
        <div style={{
            position: 'absolute', top: '12px', right: '12px', zIndex: 1000,
            background: colors.bg, border: `1px solid ${colors.border}`,
            borderRadius: '10px', padding: '8px 12px',
            fontFamily: 'Inter, sans-serif', fontSize: '12px',
            color: colors.text, backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
                <span>{emoji}</span>
                <span style={{ textTransform: 'capitalize' }}>{worst_condition.replace(/_/g, ' ')}</span>
                <span style={{
                    marginLeft: 'auto', fontSize: '10px', fontWeight: 800,
                    background: colors.border, color: '#fff',
                    borderRadius: '4px', padding: '1px 5px',
                }}>{severity}</span>
            </div>
            {extraEta > 0 && (
                <div style={{ fontSize: '11px', opacity: 0.85 }}>
                    ⏱ ETA +{extraEta}% · {affected_count} stop{affected_count !== 1 ? 's' : ''} affected
                </div>
            )}
            {weatherSummary.is_monsoon && (
                <div style={{ fontSize: '10px', opacity: 0.7, fontStyle: 'italic' }}>🌊 Monsoon season active</div>
            )}
        </div>
    );
};

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

const RouteMap = ({ stops = [], unassignedOrders = [], weatherSummary = null }) => {
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
    const [showWeatherOverlay, setShowWeatherOverlay] = React.useState(false);
    // Open-Meteo does not provide tile layers; we use OpenWeatherMap free tile API.
    // Falls back gracefully with no API key (tiles won't load but map stays functional).
    const OWM_KEY = import.meta.env?.VITE_OPENWEATHER_API_KEY || '';


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

                {/* ── Weather Precipitation Overlay (OpenWeatherMap tile) ──────── */}
                {showWeatherOverlay && OWM_KEY && (
                    <TileLayer
                        url={`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`}
                        opacity={0.55}
                        attribution='Weather &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>'
                    />
                )}
                {showWeatherOverlay && !OWM_KEY && (
                    <TileLayer
                        url="https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png"
                        opacity={0.4}
                        attribution='Weather &copy; OpenWeatherMap'
                    />
                )}

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
        {/* Weather overlay toggle button */}
        <button
            onClick={() => setShowWeatherOverlay(v => !v)}
            title={showWeatherOverlay ? 'Hide weather overlay' : 'Show weather overlay'}
            style={{
                position: 'absolute', bottom: '16px', left: '16px', zIndex: 1001,
                background: showWeatherOverlay ? '#3b82f6' : 'rgba(255,255,255,0.92)',
                color: showWeatherOverlay ? '#fff' : '#374151',
                border: '1px solid #d1d5db', borderRadius: '8px',
                padding: '7px 12px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '5px',
            }}
        >
            🌦️ {showWeatherOverlay ? 'Weather ON' : 'Weather OFF'}
        </button>
        {/* Weather summary badge (populated after optimization) */}
        <WeatherBadge weatherSummary={weatherSummary} />
    </div>
);
};

export default RouteMap;
