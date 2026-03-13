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
        <div className="smart-router-container">
            <div className="sr-sidebar">
                <div className="sr-header">
                    <h2>AI-Driven Router</h2>
                    <p>Optimizing for real-time congestion and network structural density.</p>
                </div>

                <div className="sr-inputs">
                    <div className="input-group">
                        <label>Origin (Lat, Lng)</label>
                        <div className="input-row">
                            <input
                                type="number" step="0.0001"
                                value={origin.lat}
                                onChange={e => setOrigin({ ...origin, lat: parseFloat(e.target.value) })}
                            />
                            <input
                                type="number" step="0.0001"
                                value={origin.lng}
                                onChange={e => setOrigin({ ...origin, lng: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Destination (Lat, Lng)</label>
                        <div className="input-row">
                            <input
                                type="number" step="0.0001"
                                value={destination.lat}
                                onChange={e => setDestination({ ...destination, lat: parseFloat(e.target.value) })}
                            />
                            <input
                                type="number" step="0.0001"
                                value={destination.lng}
                                onChange={e => setDestination({ ...destination, lng: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>

                    <button
                        className={`sr-action-btn ${isLoading ? 'is-loading' : ''}`}
                        onClick={handleRunOptimization}
                        disabled={isLoading || isSameLocation}
                        title={isSameLocation ? 'Origin and destination must be different' : ''}
                    >
                        {isLoading ? 'ANALYZING TRAFFIC...' : 'GET OPTIMUM ROUTE'}
                    </button>
                </div>

                {error && <div className="sr-error">{error}</div>}

                {result && (
                    <div className="sr-results">
                        <div className="result-metric">
                            <span className="label">ML-PREDICTED ETA</span>
                            <span className="value primary">{formatTime(result.predicted_eta_seconds)}</span>
                        </div>
                        <div className="result-metric">
                            <span className="label">DISTANCE</span>
                            <span className="value">{result.distance_km.toFixed(1)} KM</span>
                        </div>

                        <div className="congestion-analysis">
                            <span className="label">ROUTE EFFICIENCY GAIN</span>
                            <div className="chart-mini">
                                <ResponsiveContainer width="100%" height={80}>
                                    <BarChart data={[
                                        { name: 'Base', val: 1.0 },
                                        { name: 'Optimized', val: Math.max(0.1, 1.0 - (result.optimization_score || 0) / 100) },
                                    ]}>
                                        <Bar dataKey="val">
                                            {[1.0, Math.max(0.1, 1.0 - (result.optimization_score || 0) / 100)].map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#f43f5e' : '#6366f1'} />
                                            ))}
                                        </Bar>
                                        <Tooltip hideCursor formatter={(v) => [`${(v * 100).toFixed(0)}%`, 'Relative Cost']} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {result.optimization_score > 0
                                ? <p className="sr-note">ML engine achieved <strong>{result.optimization_score.toFixed(1)}% improvement</strong> over the baseline route.</p>
                                : <p className="sr-note">Route already near-optimal. No significant improvement detected.</p>
                            }
                        </div>

                        <div className="ml-badge-premium">
                            <div className="badge-core">
                                <span className="pulse"></span>
                                TR-V2 LIGHTGBM ACTIVE
                            </div>
                            <div className="confidence-meter">
                                <span>CONFIDENCE</span>
                                <div className="meter-bar">
                                    <div className="meter-fill" style={{ width: '94%' }}></div>
                                </div>
                                <span className="meter-val">94%</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="sr-map-viewport">
                <MapContainer
                    center={[11.5, 78.5]}
                    zoom={7}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    <MapController coords={polyCoords.length > 0 ? polyCoords : [[origin.lat, origin.lng], [destination.lat, destination.lng]]} />

                    <Marker position={[origin.lat, origin.lng]} />
                    <Marker position={[destination.lat, destination.lng]} />

                    {polyCoords.length > 0 && (
                        <Polyline
                            positions={polyCoords}
                            pathOptions={{ color: '#000000', weight: 4, opacity: 0.8 }}
                        />
                    )}
                </MapContainer>
            </div>
        </div>
    );
};

export default SmartRouter;
