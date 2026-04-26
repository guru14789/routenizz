import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, ScatterChart, Scatter, LineChart, Line
} from 'recharts';
import './Analytics.css';
import { API_ROUTES } from '../config.js';
import { getAuthHeaders } from '../services/backendAuthService';

const API_BASE_URL = API_ROUTES.analytics;

const Analytics = () => {
    const [featureImportance, setFeatureImportance] = useState([]);
    const [trafficTrendData, setTrafficTrendData] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [modelAccuracyTrend, setModelAccuracyTrend] = useState([]);
    const [engineStatus, setEngineStatus] = useState({ model_version: 'Loading...', status: 'Initializing', r2_score: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAnalyticsData = async () => {
            try {
                const endpoints = [
                    '/feature-importance',
                    '/traffic-trend',
                    '/performance-scatter',
                    '/accuracy-trend',
                    '/engine-status'
                ];

                const authHeaders = getAuthHeaders();
                const results = await Promise.all(endpoints.map(async (ep) => {
                    const res = await fetch(`${API_BASE_URL}${ep}`, { headers: authHeaders });
                    if (!res.ok) {
                        if (res.status === 401) throw new Error("Unauthorized: Backend access denied.");
                        if (res.status === 403) throw new Error("Forbidden: Admin privileges required.");
                        throw new Error(`Failed to fetch ${ep} (Status: ${res.status})`);
                    }
                    return res.json();
                }));

                const [features, trend, scatter, accuracy, status] = results;

                setFeatureImportance(features);
                setTrafficTrendData(trend);
                setPerformanceData(scatter);
                setModelAccuracyTrend(accuracy);
                setEngineStatus(status);
            } catch (err) {
                console.error("Failed to fetch real-time analytics:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalyticsData();
    }, []);

    if (loading) {
        return (
            <div className="analytics-container loading">
                <div className="loader-spinner"></div>
                <p>Synchronizing Predictive Intelligence...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="analytics-container error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                <div className="error-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                <h3 style={{ color: '#f8fafc' }}>Synchronization Halted</h3>
                <p style={{ maxWidth: '400px', textAlign: 'center', marginBottom: '1.5rem' }}>{error}</p>
                <button 
                    onClick={() => window.location.reload()} 
                    style={{ padding: '0.75rem 1.5rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="analytics-container" style={{ background: 'var(--bg-secondary)', padding: '24px' }}>
            <header className="analytics-header" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 800 }}>PREDICTIVE ENGINE INTELLIGENCE</h2>
                <div className="status-chip" style={{ background: '#000', color: '#fff', padding: '4px 12px', fontSize: '10px', fontWeight: 800 }}>
                    <span className="pulse-dot"></span>
                    MODEL: {engineStatus.model_version} [{engineStatus.status}]
                </div>
            </header>

            <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
                {/* 1. Feature Importance Card */}
                <div className="analytics-card" style={{ background: '#fff', border: '2px solid #000', padding: '24px' }}>
                    <div className="card-info" style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>FEATURE_IMPORTANCE</h3>
                        <p style={{ fontSize: '10px', color: '#666' }}>WEIGHT OF VARIABLES IN ETA CALCULATIONS</p>
                    </div>
                    <div className="chart-wrapper" style={{ filter: 'grayscale(1)' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={featureImportance} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} />
                                <Tooltip
                                    cursor={{ fill: '#eee' }}
                                    contentStyle={{ background: '#000', border: 'none', color: '#fff', fontSize: '10px' }}
                                />
                                <Bar dataKey="value" fill="#000" barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Congestion Heatmap-like Area Chart */}
                <div className="analytics-card" style={{ background: '#fff', border: '2px solid #000', padding: '24px' }}>
                    <div className="card-info" style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>TRAFFIC_INTENSITY_TRENDS</h3>
                        <p style={{ fontSize: '10px', color: '#666' }}>24-HOUR OPERATIONAL CONGESTION MULTIPLIER</p>
                    </div>
                    <div className="chart-wrapper" style={{ filter: 'grayscale(1)' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={trafficTrendData}>
                                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} />
                                <YAxis tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} domain={[1.0, 'auto']} />
                                <Tooltip
                                    contentStyle={{ background: '#000', border: 'none', color: '#fff', fontSize: '10px' }}
                                />
                                <Area type="stepAfter" dataKey="multiplier" stroke="#000" fill="#000" fillOpacity={0.1} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Performance Scatter Card */}
                <div className="analytics-card" style={{ background: '#fff', border: '2px solid #000', padding: '24px' }}>
                    <div className="card-info" style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>ACTUAL_VS_PREDICTED_VARIANCE</h3>
                        <p style={{ fontSize: '10px', color: '#666' }}>MODEL R²: {engineStatus.r2_score} | DISPERSION AUDIT</p>
                    </div>
                    <div className="chart-wrapper" style={{ filter: 'grayscale(1)' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <ScatterChart>
                                <XAxis type="number" dataKey="actual" name="Actual" tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} unit="x" />
                                <YAxis type="number" dataKey="predicted" name="Predicted" tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} unit="x" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="Predictions" data={performanceData} fill="#000" shape="cross" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Accuracy Trend Line Card */}
                <div className="analytics-card" style={{ background: '#fff', border: '2px solid #000', padding: '24px' }}>
                    <div className="card-info" style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>DRIFT_DETECTION_LOG</h3>
                        <p style={{ fontSize: '10px', color: '#666' }}>7-DAY ENGINE CONFIDENCE SCORE</p>
                    </div>
                    <div className="chart-wrapper" style={{ filter: 'grayscale(1)' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={modelAccuracyTrend}>
                                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} />
                                <YAxis domain={[85, 100]} tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} />
                                <Tooltip
                                    contentStyle={{ background: '#000', border: 'none', color: '#fff', fontSize: '10px' }}
                                />
                                <Line type="stepAfter" dataKey="accuracy" stroke="#000" strokeWidth={2} dot={{ fill: '#000', r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 5. Orion Efficiency Gap Card */}
                <div className="analytics-card" style={{ background: '#fff', border: '2px solid #000', padding: '24px' }}>
                    <div className="card-info" style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>ORION_EFFICIENCY_GAP</h3>
                        <p style={{ fontSize: '10px', color: '#666' }}>PLANNED VS ACTUAL DURATION VARIANCE [SEC]</p>
                    </div>
                    <div className="chart-wrapper" style={{ filter: 'grayscale(1)' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={[
                                {category: "HIGH_TRAFFIC", gap: 15.2},
                                {category: "SCHOOL_ZONES", gap: 8.4},
                                {category: "INDUSTRIAL", gap: 2.1},
                                {category: "RESIDENTIAL", gap: -1.5}
                            ]}>
                                <XAxis dataKey="category" tick={{ fontSize: 9, fill: '#000', fontWeight: 700 }} />
                                <YAxis tick={{ fontSize: 10, fill: '#000', fontWeight: 700 }} />
                                <Tooltip
                                    contentStyle={{ background: '#000', border: 'none', color: '#fff', fontSize: '10px' }}
                                />
                                <Bar dataKey="gap" fill="#000" barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="insights-footer" style={{ marginTop: '32px', borderTop: '2px solid #000', paddingTop: '16px' }}>
                <div className="insight-pill" style={{ background: '#000', color: '#fff', padding: '12px', fontSize: '11px', fontWeight: 700 }}>
                    <strong>[STRATEGY_RECOMMENDATION]:</strong> OPTIMIZE 11:00-14:00 WINDOW TO BYPASS 17:00 CONGESTION SURGE. 15% EFFICIENCY GAIN PROJECTED.
                </div>
            </div>
        </div>
    );
};

export default Analytics;
