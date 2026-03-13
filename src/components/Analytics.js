import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, ScatterChart, Scatter, LineChart, Line
} from 'recharts';
import './Analytics.css';
import { API_ROUTES } from '../config.js';

const API_BASE_URL = API_ROUTES.analytics;

const Analytics = () => {
    const [featureImportance, setFeatureImportance] = useState([]);
    const [trafficTrendData, setTrafficTrendData] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [modelAccuracyTrend, setModelAccuracyTrend] = useState([]);
    const [engineStatus, setEngineStatus] = useState({ model_version: 'Loading...', status: 'Initializing', r2_score: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalyticsData = async () => {
            try {
                const [features, trend, scatter, accuracy, status] = await Promise.all([
                    fetch(`${API_BASE_URL}/feature-importance`).then(res => res.json()),
                    fetch(`${API_BASE_URL}/traffic-trend`).then(res => res.json()),
                    fetch(`${API_BASE_URL}/performance-scatter`).then(res => res.json()),
                    fetch(`${API_BASE_URL}/accuracy-trend`).then(res => res.json()),
                    fetch(`${API_BASE_URL}/engine-status`).then(res => res.json())
                ]);

                setFeatureImportance(features);
                setTrafficTrendData(trend);
                setPerformanceData(scatter);
                setModelAccuracyTrend(accuracy);
                setEngineStatus(status);
                setLoading(false);
            } catch (error) {
                console.error("Failed to fetch real-time analytics:", error);
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

    return (
        <div className="analytics-container">
            <header className="analytics-header">
                <h2>Predictive Engine Intelligence</h2>
                <div className="model-status-badge">
                    <span className={`dot ${engineStatus.status === 'Active' ? 'pulse' : ''}`}></span>
                    Model: {engineStatus.model_version} ({engineStatus.status})
                </div>
            </header>

            <div className="analytics-grid">
                {/* 1. Feature Importance Card */}
                <div className="analytics-card">
                    <div className="card-info">
                        <h3>Feature Importance</h3>
                        <p>What fuels our ETA predictions? Hour and road type are the primary drivers of congestion.</p>
                    </div>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={featureImportance} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Congestion Heatmap-like Area Chart */}
                <div className="analytics-card">
                    <div className="card-info">
                        <h3>Traffic Intensity Trends</h3>
                        <p>Multiplier impact across a 24-hour cycle. Evening peak remains the highest operational challenge.</p>
                    </div>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={trafficTrendData}>
                                <defs>
                                    <linearGradient id="colorMult" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[1.0, 'auto']} />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="multiplier" stroke="#6366f1" fillOpacity={1} fill="url(#colorMult)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Performance Scatter Card */}
                <div className="analytics-card">
                    <div className="card-info">
                        <h3>Actual vs. Predicted Multiplier</h3>
                        <p>Model R²: {engineStatus.r2_score}. Dispersion represents unexpected volatility in road segments.</p>
                    </div>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <ScatterChart>
                                <XAxis type="number" dataKey="actual" name="Actual" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="x" />
                                <YAxis type="number" dataKey="predicted" name="Predicted" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="x" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="Predictions" data={performanceData} fill="#ec4899" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Accuracy Trend Line Card */}
                <div className="analytics-card">
                    <div className="card-info">
                        <h3>Drift Detection & Reliability</h3>
                        <p>Confidence score of routing engine over the last 7 days. Higher on weekends due to predictable patterns.</p>
                    </div>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={modelAccuracyTrend}>
                                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis domain={[85, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                />
                                <Line type="stepAfter" dataKey="accuracy" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: '#8b5cf6', r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="insights-footer">
                <div className="insight-pill">
                    <strong>Optimization Strategy:</strong> The engine recommends scheduling 15% more deliveries during the 11:00-14:00 window to avoid the 17:00 surge.
                </div>
            </div>
        </div>
    );
};

export default Analytics;
