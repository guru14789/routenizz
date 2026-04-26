/**
 * USES: Standalone AI Routing module.
 * SUPPORT: Provides an interactive map interface to test point-to-point routing using the LightGBM traffic prediction engine.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchOptimizedRoute } from '../logic/streetRouting';
import './SmartRouter.css';

const MapController = ({ coords }) => {
    const map = useMap();
    // Stable key: only recalculates bounds when first or last point changes
    const coordKey = coords?.length
        ? `${coords[0]}|${coords[coords.length - 1]}|${coords.length}`
        : '';

    useEffect(() => {
        if (!coords || coords.length === 0) return;
        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding: [40, 40], animate: true });
    }, [coordKey, map]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
};

const SmartRouter = () => {
    const [origin, setOrigin] = useState(() => {
        const settings = JSON.parse(localStorage.getItem('route_settings')) || {};
        return { lat: parseFloat(settings.officeLat) || 13.0827, lng: parseFloat(settings.officeLng) || 80.2707 };
    });
    // Default destination to a different coordinate (Chennai Central Station)
    // so origin ≠ destination is guaranteed on first open
    const [destination, setDestination] = useState({ lat: 13.0604, lng: 80.2496 });
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Validate a single coordinate field (lat or lng) and return an error string or null
    const validateCoord = (value, type) => {
        const n = parseFloat(value);
        if (isNaN(n)) return `${type} must be a number`;
        if (type === 'lat' && (n < -90 || n > 90)) return 'Latitude must be between -90 and 90';
        if (type === 'lng' && (n < -180 || n > 180)) return 'Longitude must be between -180 and 180';
        return null;
    };

    const isSameLocation =
        Math.abs(origin.lat - destination.lat) < 0.0001 &&
        Math.abs(origin.lng - destination.lng) < 0.0001;

    const handleRunOptimization = async () => {
        // Validate all four fields before calling the API
        const latErrors = [
            validateCoord(origin.lat, 'lat'),
            validateCoord(origin.lng, 'lng'),
            validateCoord(destination.lat, 'lat'),
            validateCoord(destination.lng, 'lng'),
        ].filter(Boolean);

        if (latErrors.length > 0) { setError(latErrors[0]); return; }
        if (isSameLocation) { setError('Origin and destination cannot be the same location.'); return; }

        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchOptimizedRoute(origin, destination);
            if (data) {
                setResult(data);
            } else {
                setError('Could not connect to the SmartRouteEngine. Ensure the ML API is running.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    // Parse OSRM geometry (standard or optimized payload)
    const getPolylineCoords = () => {
        if (!result || !result.selected_route_geometry) return [];
        // OSRM returns GeoJSON coordinates [lng, lat]
        return result.selected_route_geometry.coordinates.map(c => [c[1], c[0]]);
    };

    const polyCoords = getPolylineCoords();

    return (
        <div className="smart-router-container" style={{ background: '#fff', height: 'calc(100vh - 120px)' }}>
            <div className="sr-sidebar" style={{ width: '400px', borderRight: '2px solid #000', padding: '24px', background: '#fff', overflowY: 'auto' }}>
                <div style={{ marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800 }}>AI_ROUTING_TERMINAL</h2>
                    <p style={{ fontSize: '10px', color: '#666' }}>OPTIMIZING FOR REAL-TIME CONGESTION DENSITY</p>
                </div>

                <div className="sr-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>ORIGIN_COORDINATES (LAT/LNG)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <input type="number" step="0.0001" value={origin.lat} onChange={e => setOrigin({ ...origin, lat: parseFloat(e.target.value) })} />
                            <input type="number" step="0.0001" value={origin.lng} onChange={e => setOrigin({ ...origin, lng: parseFloat(e.target.value) })} />
                        </div>
                    </div>

                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>DESTINATION_COORDINATES (LAT/LNG)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <input type="number" step="0.0001" value={destination.lat} onChange={e => setDestination({ ...destination, lat: parseFloat(e.target.value) })} />
                            <input type="number" step="0.0001" value={destination.lng} onChange={e => setDestination({ ...destination, lng: parseFloat(e.target.value) })} />
                        </div>
                    </div>

                    <button
                        className="btn-obsidian"
                        onClick={handleRunOptimization}
                        disabled={isLoading || isSameLocation}
                        style={{ padding: '16px', fontSize: '12px' }}
                    >
                        {isLoading ? 'ANALYZING_TRAFFIC_NETWORK...' : 'EXECUTE_OPTIMIZATION'}
                    </button>
                </div>

                {error && <div style={{ background: '#000', color: '#fff', padding: '12px', fontSize: '10px', fontFamily: 'JetBrains Mono', marginBottom: '24px' }}>[ERR] {error}</div>}

                {result && (
                    <div className="sr-results" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="analytics-card" style={{ padding: '16px', border: '2px solid #000', background: '#fff' }}>
                                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', marginBottom: '8px' }}>ML_PREDICTED_ETA</div>
                                <div style={{ fontSize: '18px', fontWeight: 900 }}>{formatTime(result.predicted_eta_seconds)}</div>
                            </div>
                            <div className="analytics-card" style={{ padding: '16px', border: '2px solid #000', background: '#fff' }}>
                                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', marginBottom: '8px' }}>TOTAL_DISTANCE</div>
                                <div style={{ fontSize: '18px', fontWeight: 900 }}>{result.distance_km.toFixed(1)} KM</div>
                            </div>
                        </div>

                        <div className="analytics-card" style={{ padding: '16px', border: '2px solid #000', background: '#fff' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', marginBottom: '16px' }}>EFFICIENCY_GAIN_ANALYSIS</div>
                            <div style={{ height: '80px', filter: 'grayscale(1)' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'Base', val: 1.0 },
                                        { name: 'Optimized', val: Math.max(0.1, 1.0 - (result.optimization_score || 0) / 100) },
                                    ]}>
                                        <Bar dataKey="val" fill="#000">
                                            {[1.0, Math.max(0.1, 1.0 - (result.optimization_score || 0) / 100)].map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#666' : '#000'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p style={{ fontSize: '10px', fontWeight: 700, marginTop: '12px' }}>
                                ENGINE ACHIEVED {result.optimization_score.toFixed(1)}% IMPROVEMENT OVER BASELINE.
                            </p>
                        </div>

                        <div style={{ background: '#000', color: '#fff', padding: '16px', border: '2px solid #000' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 900 }}>TR-V2_LIGHTGBM_ACTIVE</span>
                                <span style={{ fontSize: '10px', fontWeight: 900 }}>CONF_LVL: 94%</span>
                            </div>
                            <div style={{ height: '4px', background: '#333', position: 'relative' }}>
                                <div style={{ width: '94%', height: '100%', background: '#fff' }}></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="sr-map-viewport" style={{ flex: 1, position: 'relative' }}>
                <MapContainer center={[origin.lat, origin.lng]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    <MapController coords={polyCoords.length > 0 ? polyCoords : [[origin.lat, origin.lng], [destination.lat, destination.lng]]} />
                    <Marker position={[origin.lat, origin.lng]} />
                    <Marker position={[destination.lat, destination.lng]} />
                    {polyCoords.length > 0 && <Polyline positions={polyCoords} pathOptions={{ color: '#000', weight: 4, opacity: 0.8 }} />}
                </MapContainer>
            </div>
        </div>
    );
};

export default SmartRouter;
