/**
 * USES: Analytical KPI dashboard strip.
 * SUPPORT: Visualizes key performance metrics like total fuel saved, carbon footprint, and route optimization scores for the entire fleet.
 */
import React, { useEffect, useState } from 'react';

import './PremiumStats.css';
import { fetchRouteMetadata } from '../logic/streetRouting';

// Black SVG Icons for Stats (Monochrome)
const Icons = {
    Package: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.29 7 12 12 20.71 7" />
            <line x1="12" y1="22" x2="12" y2="12" />
        </svg>
    ),
    Marker: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    ),
    CheckCircle: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    Route: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M13 18l5-5-5-5" />
            <path d="M6 18V6" />
            <path d="M6 12h12" />
        </svg>
    ),
    Currency: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    ),
    Fuel: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 22V2h11v11h2V2h4v7" /><path d="M7 22v-4" /><path d="M11 22v-4" /><path d="M14 13h4v11" /><circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    )
};

const StatCard = ({ title, value, unit, icon, onClick, compact, trend }) => {
    return (
        <div
            className={`analytics-card ${onClick ? 'clickable' : ''}`}
            onClick={onClick}
            style={{ 
                padding: compact ? '12px' : '20px', 
                background: '#fff', 
                border: '2px solid #000', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.1s'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ color: '#000' }}>{icon}</div>
            </div>
            <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: compact ? '18px' : '24px', fontWeight: 900 }}>{value}</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#666' }}>{unit}</span>
                </div>
                {trend && (
                    <div style={{ fontSize: '9px', fontWeight: 700, color: '#000', marginTop: '4px', textTransform: 'uppercase' }}>
                        [{trend}]
                    </div>
                )}
            </div>
        </div>
    );
};

const PremiumStats = ({ orders, route, onActiveOrdersClick, onRouteStopsClick, onCompletedOrdersClick, compact, vertical, stats }) => {
    const activeOrders = orders.filter(o => o.status === 'Pending').length;
    const completedOrders = orders.filter(o => o.status === 'Completed').length;
    const totalStops = route.length;

    const [realDistance, setRealDistance] = useState("0.0");
    const routeKey = `${route.length}-${route[0]?.id || ''}-${route[route.length - 1]?.id || ''}`;

    useEffect(() => {
        const getDistanceData = async () => {
            if (route && route.length > 1) {
                try {
                    const coords = route.map(p => [p.lat, p.lng]);
                    const metadata = await fetchRouteMetadata(coords);
                    if (metadata && metadata.distance > 0) {
                        setRealDistance(metadata.distance);
                        return;
                    }
                } catch (e) {
                    console.warn("OSRM distance fetch failed");
                }
                const calculateDistance = (p1, p2) => {
                    const R = 6371;
                    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
                    const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return R * c;
                };
                let totalDistKm = 0;
                for (let i = 0; i < route.length - 1; i++) {
                    totalDistKm += calculateDistance(route[i], route[i + 1]);
                }
                setRealDistance((totalDistKm * 1.41).toFixed(1));
            } else {
                setRealDistance("0.0");
            }
        };
        getDistanceData();
    }, [routeKey]);

    return (
        <div style={{ 
            display: 'grid', 
            gridTemplateColumns: vertical ? '1fr' : (compact ? 'repeat(auto-fit, minmax(140px, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))'), 
            gap: '16px' 
        }}>
            <StatCard
                title="ACTIVE_ORDERS"
                value={activeOrders}
                unit="UNIT"
                icon={<Icons.Package />}
                trend={activeOrders > 0 ? "PENDING" : "CLEAR"}
                onClick={onActiveOrdersClick}
                compact={compact}
            />
            <StatCard
                title="ROUTE_STOPS"
                value={totalStops}
                unit="PNTS"
                icon={<Icons.Marker />}
                trend="OPTIMIZED"
                onClick={onRouteStopsClick}
                compact={compact}
            />
            <StatCard
                title="COMPLETED"
                value={completedOrders}
                unit="UNIT"
                icon={<Icons.CheckCircle />}
                trend="SUCCESS"
                onClick={onCompletedOrdersClick}
                compact={compact}
            />
            <StatCard
                title="EST_DISTANCE"
                value={realDistance}
                unit="KM"
                icon={<Icons.Route />}
                trend="STREET_LVL"
                compact={compact}
            />
            {stats && (
                <>
                    <StatCard
                        title="TOTAL_COST"
                        value={stats.total_cost > 0 ? `₹${stats.total_cost}` : '0'}
                        unit=""
                        icon={<Icons.Currency />}
                        trend={stats.breakdown ? `LBR: ₹${stats.breakdown.labor}` : 'MINIMAL'}
                        compact={compact}
                    />
                    <StatCard
                        title="FUEL_CONSUMPTION"
                        value={stats.fuel || 0}
                        unit="L"
                        icon={<Icons.Fuel />}
                        trend="ECO_MODE"
                        compact={compact}
                    />
                </>
            )}
        </div>
    );
};

export default PremiumStats;
