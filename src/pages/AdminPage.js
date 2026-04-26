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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    ),
    Queue: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
    ),
    Planner: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M3 3h18v18H3z" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
    ),
    Fleet: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M1 3h15l4 4v12H1z" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="15" cy="19" r="2" />
        </svg>
    ),
    Analytics: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M3 20h18" />
            <path d="M6 16v-4" />
            <path d="M10 16V8" />
            <path d="M14 16V4" />
            <path d="M18 16v-6" />
        </svg>
    ),
    Settings: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <rect x="4" y="4" width="16" height="16" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ),
    Logout: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    ),
    User: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    ),
    AI: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
    )
};

import { useNavigate, useParams } from 'react-router-dom';

const AdminPage = ({ orders, route, setRoute, isCalculating, onRecalculate, onAddOrder, onDeleteOrder, onLogout, onToggleRole, drivers, onAddDriver, onUpdateDriver, onDeleteDriver, gpsStatus, stats }) => {
    const { tab: activeTab = 'overview', id: paramId } = useParams();
    const navigate = useNavigate();

    const [clockTime, setClockTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setClockTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const SidebarItem = ({ id, label, icon }) => (
        <button
            className={`sidebar-link ${activeTab === id ? 'is-active' : ''}`}
            onClick={() => navigate(`/admin/${id}`)}
            style={{ 
                borderRadius: 0, 
                border: 'none', 
                background: activeTab === id ? '#000' : 'transparent',
                color: activeTab === id ? '#fff' : '#000',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 24px',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '11px',
                textTransform: 'uppercase'
            }}
        >
            <span style={{ display: 'flex' }}>{icon}</span>
            <span>{label}</span>
        </button>
    );

    return (
        <div className="admin-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh', background: '#fff' }}>
            <aside className="admin-sidebar" style={{ borderRight: '2px solid #000', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '32px 24px', borderBottom: '2px solid #000' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#000', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px' }}>R</div>
                        <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '-1px', textTransform: 'uppercase' }}>ROUTENIZZ</span>
                    </div>
                </div>

                <nav style={{ flex: 1, padding: '24px 0' }}>
                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#666', padding: '0 24px 12px', letterSpacing: '1px' }}>OPERATIONS</div>
                    <SidebarItem id="overview" label="TERMINAL" icon={<Icons.Dashboard />} />
                    <SidebarItem id="smart_router" label="AI_ROUTING" icon={<Icons.AI />} />
                    <SidebarItem id="active_orders" label="QUEUE" icon={<Icons.Queue />} />
                    <SidebarItem id="route_stops" label="PLANNER" icon={<Icons.Planner />} />

                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#666', padding: '32px 24px 12px', letterSpacing: '1px' }}>FLEET</div>
                    <SidebarItem id="drivers" label="UNITS" icon={<Icons.Fleet />} />
                    <SidebarItem id="analytics" label="INSIGHTS" icon={<Icons.Analytics />} />
                </nav>

                <div style={{ marginTop: 'auto' }}>
                    <SidebarItem id="settings" label="CONFIG" icon={<Icons.Settings />} />
                    <div style={{ padding: '24px', borderTop: '2px solid #000', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#000', color: '#fff', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icons.User />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 900, fontSize: '11px', textTransform: 'uppercase' }}>ROOT_ADMIN</div>
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 700 }}>v2.1-STABLE</div>
                        </div>
                        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #000', padding: '6px', cursor: 'pointer' }}>
                            <Icons.Logout />
                        </button>
                    </div>
                </div>
            </aside>

            <main style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <header style={{ padding: '24px 40px', borderBottom: '2px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 100 }}>
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>{activeTab.replace('_', ' ')}</h1>
                        <div style={{ fontSize: '10px', color: '#666', fontWeight: 700, marginTop: '4px' }}>
                            ADMIN / {activeTab.toUpperCase()} / {clockTime.toLocaleDateString().toUpperCase()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '24px' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666' }}>UNITS_ONLINE</div>
                                <div style={{ fontSize: '14px', fontWeight: 900 }}>{drivers.length}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666' }}>ACTIVE_LOAD</div>
                                <div style={{ fontSize: '14px', fontWeight: 900 }}>{orders.length}</div>
                            </div>
                        </div>
                        <div style={{ height: '32px', width: '2px', background: '#eee' }}></div>
                        <div style={{ fontSize: '16px', fontWeight: 900, fontFamily: 'JetBrains Mono', letterSpacing: '1px' }}>
                            {clockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </div>
                    </div>
                </header>

                <div style={{ padding: '40px', flex: 1 }}>
                    {activeTab === 'overview' ? (
                        <Dashboard
                            orders={orders}
                            route={route}
                            setRoute={setRoute}
                            isCalculating={isCalculating}
                            onRecalculate={onRecalculate}
                            onAddOrder={onAddOrder}
                            onDeleteOrder={onDeleteOrder}
                            onActiveOrdersClick={() => navigate('/admin/active_orders')}
                            onRouteStopsClick={() => navigate('/admin/route_stops')}
                            onCompletedOrdersClick={() => navigate('/admin/completed_orders')}
                            drivers={drivers}
                            onToggleRole={onToggleRole}
                            stats={stats}
                            gpsStatus={gpsStatus}
                        />
                    ) : activeTab === 'smart_router' ? (
                        <SmartRouter />
                    ) : activeTab === 'active_orders' ? (
                        <div>
                            <div style={{ marginBottom: '32px' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 800 }}>MASTER_ORDER_QUEUE</h2>
                                <p style={{ fontSize: '10px', color: '#666' }}>PENDING_ASSIGNMENTS_REQUIRING_DISPATCH</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                                {orders.filter(o => o.status === 'Pending').map((order, index) => (
                                    <RouteCard key={order.id} order={order} index={index} onDelete={onDeleteOrder} />
                                ))}
                            </div>
                        </div>
                    ) : activeTab === 'route_stops' ? (
                        <div>
                            <div style={{ marginBottom: '32px' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 800 }}>ALGORITHMIC_MANIFEST</h2>
                                <p style={{ fontSize: '10px', color: '#666' }}>OPTIMIZED_SEQUENCE_FOR_FLEET_DISTRIBUTION</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px', opacity: isCalculating ? 0.5 : 1 }}>
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
                            onDeleteDriver={onDeleteDriver}
                            onRecalculate={onRecalculate}
                            onToggleRole={onToggleRole}
                            selectedDriverId={paramId}
                        />
                    ) : activeTab === 'analytics' ? (
                        <AnalyticsPanel />
                    ) : activeTab === 'settings' ? (
                        <SettingsPane />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '100px 0', color: '#666' }}>
                            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚙️</div>
                            <div style={{ fontWeight: 800, fontSize: '12px' }}>MODULE_OFFLINE</div>
                            <p style={{ fontSize: '10px' }}>CALIBRATING_SYSTEM_RESOURCES</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminPage;

export default AdminPage;
