/**
 * USES: Top-level container for the Administrator experience.
 * SUPPORT: Orchestrates the Layout, Settings, Driver Management, and Dashboard sub-components within the Admin role context.
 */
import React, { useState, useEffect } from 'react';

import Dashboard from '../components/Dashboard';
import DriverManagement from '../components/DriverManagement';
import RouteCard from '../components/RouteCard';
import SettingsPane from '../components/SettingsPane';
import SmartRouter from '../components/SmartRouter';
import AnalyticsPanel from '../components/Analytics';

const Icons = {
    Dashboard: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    ),
    Queue: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
        </svg>
    ),
    Planner: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    ),
    Fleet: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
    ),
    Analytics: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    ),
    Settings: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    ),
    Switch: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3l4 4-4 4" />
            <path d="M20 7H4" />
            <path d="M8 21l-4-4 4-4" />
            <path d="M4 17h16" />
        </svg>
    ),
    Logout: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    ),
    User: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    ),
    AI: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
    )
};

const AdminPage = ({ orders, route, setRoute, isCalculating, onRecalculate, onAddOrder, onDeleteOrder, onLogout, onToggleRole, drivers, onAddDriver, onUpdateDriver, gpsStatus, stats }) => {
    const [activeTab, setActiveTab] = useState('overview');

    // Live clock — ticks every second so header shows real time
    const [clockTime, setClockTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setClockTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const SidebarItem = ({ id, label, icon }) => (
        <button
            className={`sidebar-link ${activeTab === id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(id)}
        >
            <span className="link-icon">{icon}</span>
            <span className="link-text">{label}</span>
        </button>
    );

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span className="logo-box">R</span>
                        <span className="logo-name">nizz</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-group">
                        <div className="group-label">Main Operations</div>
                        <SidebarItem id="overview" label="Command Center" icon={<Icons.Dashboard />} />
                        <SidebarItem id="smart_router" label="AI Smart Router" icon={<Icons.AI />} />
                        <SidebarItem id="active_orders" label="Live Queue" icon={<Icons.Queue />} />
                        <SidebarItem id="route_stops" label="Route Planner" icon={<Icons.Planner />} />
                    </div>

                    <div className="nav-group">
                        <div className="group-label">Management</div>
                        <SidebarItem id="drivers" label="Fleet Management" icon={<Icons.Fleet />} />
                        <SidebarItem id="analytics" label="Insights" icon={<Icons.Analytics />} />
                    </div>

                    <div className="nav-group bottom">
                        <SidebarItem id="settings" label="System Config" icon={<Icons.Settings />} />
                    </div>
                </nav>

                <div className="sidebar-user">
                    <div className="user-info">
                        <div className="user-glyph"><Icons.User /></div>
                        <div className="user-meta">
                            <span className="user-name">Administrator</span>
                            <span className="user-role">Master Account</span>
                        </div>
                    </div>
                    <button className="user-action-btn" onClick={onToggleRole} title="Switch to Driver"><Icons.Switch /></button>
                    <button className="user-action-btn" onClick={onLogout} title="Sign Out"><Icons.Logout /></button>
                </div>
            </aside>

            <main className="admin-viewport">
                <header className="viewport-header">
                    <div className="viewport-title">
                        <h1>{activeTab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</h1>
                        <div className="breadcrumb">ENTERPRISE / {activeTab.toUpperCase()}</div>
                    </div>
                    <div className="viewport-actions">
                        <div className="status-chip live">
                            <span className="pulse-dot"></span>
                            SYSTEM LIVE
                        </div>
                        <div className="clock-widget">
                            {clockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                    </div>
                </header>

                <div className="viewport-content">
                    {activeTab === 'overview' ? (
                        <Dashboard
                            orders={orders}
                            route={route}
                            setRoute={setRoute}
                            isCalculating={isCalculating}
                            onRecalculate={onRecalculate}
                            onAddOrder={onAddOrder}
                            onDeleteOrder={onDeleteOrder}
                            onActiveOrdersClick={() => setActiveTab('active_orders')}
                            onRouteStopsClick={() => setActiveTab('route_stops')}
                            onCompletedOrdersClick={() => setActiveTab('completed_orders')}
                            drivers={drivers}
                            onToggleRole={onToggleRole}
                            stats={stats}
                            gpsStatus={gpsStatus}
                        />
                    ) : activeTab === 'smart_router' ? (
                        <SmartRouter />
                    ) : activeTab === 'active_orders' ? (
                        <div className="module-view">
                            <div className="module-header">
                                <div className="module-info">
                                    <h2>Master Order Queue</h2>
                                    <p>Comprehensive list of all pending assignments waiting for dispatch.</p>
                                </div>
                            </div>
                            <div className="dynamic-grid">
                                {orders.filter(o => o.status === 'Pending').map((order, index) => (
                                    <RouteCard key={order.id} order={order} index={index} onDelete={onDeleteOrder} />
                                ))}
                            </div>
                        </div>
                    ) : activeTab === 'route_stops' ? (
                        <div className="module-view">
                            <div className="module-header alternate">
                                <div className="module-info">
                                    <div className="sub-branding">ALGORITHMIC OUTPUT {isCalculating && ' (CALIBRATING...)'}</div>
                                    <p>{isCalculating ? 'ML Prediction Engine is analyzing real-time traffic data...' : 'Smart sequence calculated for maximum distance efficiency and fuel conservation.'}</p>
                                </div>
                                {isCalculating && <div className="ml-loader-bar"></div>}
                            </div>
                            <div className="dynamic-grid" style={{ opacity: isCalculating ? 0.5 : 1 }}>
                                {route.map((order, index) => (
                                    <RouteCard key={order.id} order={order} index={index} onDelete={onDeleteOrder} />
                                ))}
                            </div>
                        </div>
                    ) : activeTab === 'drivers' ? (
                        <DriverManagement
                            orders={orders}
                            route={route}
                            setRoute={setRoute}
                            onAddOrder={onAddOrder}
                            onDeleteOrder={onDeleteOrder}
                            externalDrivers={drivers}
                            onAddDriver={onAddDriver}
                            onUpdateDriver={onUpdateDriver}
                            onRecalculate={onRecalculate}
                            onToggleRole={onToggleRole}
                        />
                    ) : activeTab === 'analytics' ? (
                        <AnalyticsPanel />
                    ) : activeTab === 'settings' ? (
                        <SettingsPane />
                    ) : (
                        <div className="empty-state">
                            <div className="empty-graphic">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                            </div>
                            <p>This enterprise feature is currently being calibrated for your network.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminPage;
