/**
 * USES: Main React application component and routing hub.
 * SUPPORT: Manages global application state (user auth, orders, routes), initializes live GPS tracking, and handles top-level navigation between Admin and Driver views.
 */
import React, { useState, useEffect } from 'react'; // React core for component lifecycle and state
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'; // SPA routing utilities
import DriverView from './components/DriverView'; // Main interface for the delivery driver
import LoginPage from './pages/LoginPage'; // User authentication (Admin/Driver) landing
import AdminPage from './pages/AdminPage'; // Global fleet management and routing dashboard
import { mockOrders } from './data/mockOrders';
import './index.css'; 

// Protected Route Component Definition
// Ensures only authenticated users can access specific sections based on their assigned role
const ProtectedRoute = ({ children, allowedRole, user, overrideRole, loading }) => {
    if (loading) return <div className="loading-screen">Authenticating TNImpact...</div>;
    if (!user) return <Navigate to="/login" replace />; 

    const effectiveRole = overrideRole || user.role;

    if (allowedRole && effectiveRole !== allowedRole) {
        console.warn(`[Auth Guard] Path requires ${allowedRole}, but user is ${effectiveRole}. Redirecting...`);
        return <Navigate to={effectiveRole === 'admin' ? '/admin' : '/driver'} replace />;
    }
    return children; 
};

// Firebase Data Management Imports
import { 
    subscribeToAuthChanges, 
    subscribeToOrders, 
    subscribeToDrivers, 
    logout as firebaseLogout, 
    addOrder as firebaseAddOrder, 
    addDriver as firebaseAddDriver, 
    updateDriver as firebaseUpdateDriver, 
    deleteDriver as firebaseDeleteDriver,
    deleteOrder as firebaseDeleteOrder,
    updateOrder
} from './services/firebaseService';
import { logout as logoutFromBackend, syncWithBackend } from './services/backendAuthService';
import { startGpsWatch } from './utils/gpsUtils';
import { 
    saveToStorage, 
    getFromStorage, 
    STORAGE_KEYS,
    initializeDefaultStorage
} from './services/storageService';
import { 
    generateNextTrafficMultiplier, 
    getTrafficStatusLabel, 
    TRAFFIC_CONFIG 
} from './logic/trafficSimulation';
import { 
    calculatePredictedDelay, 
    evaluateRouteHealth 
} from './logic/decisionEngine';

import { 
    computeLiveStats 
} from './logic/statsCalculator';
import { 
    optimizeRoute, 
    optimizeVRP, 
    optimizeWithPersistentHistory 
} from './logic/optimizer';


import { useGps } from './hooks/useGps';
import { recalculateSystemRoute } from './services/routeService';

function AdminRouteWrapper({ user, overrideRole, loading, ...props }) {
    return (
        <ProtectedRoute user={user} overrideRole={overrideRole} allowedRole="admin" loading={loading}>
            <AdminPage {...props} />
        </ProtectedRoute>
    );
}

function AppContent() { // Inner component to access the useNavigate hook
    // State Initialization: Application data layer
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [userOverrideRole, setUserOverrideRole] = useState(null);
    const [orders, setOrders] = useState([]); // Master list of delivery orders
    const [route, setRoute] = useState([]); // The currently calculated sequence of stops
    const [currentStopIndex, setCurrentStopIndex] = useState(0); // Progress tracker for driver mission
    const [routeStatus, setRouteStatus] = useState('On Time'); // High-level status for telemetry
    const [trafficMultiplier, setTrafficMultiplier] = useState(1.0); // Real-time congestion factor
    const [delayMinutes, setDelayMinutes] = useState(0); // Accuracy factor for ETA
    const [delayHistory, setDelayHistory] = useState([]); // Persistent log of historical stop delays
    const [lastRecalcTime, setLastRecalcTime] = useState(0); // Cooldown for auto-recalculation
    const [stats, setStats] = useState({ fuel: 0, carbon: 0, total_cost: 0, breakdown: null }); // Performance metrics
    const [isCalculating, setIsCalculating] = useState(false); // Global loading state for optimization runs
    const [drivers, setDrivers] = useState([]); // Fleet assets list for VRP multi-driver slotting
    const [selectedSimulatedDriverId, setSelectedSimulatedDriverId] = useState(null); // View control for simulations
    const navigate = useNavigate();

    // 1 — Geolocation & Tracking (Hook-based)
    const activeRole = userOverrideRole || user?.role;
    const { liveLocation, gpsStatus } = useGps(activeRole === 'driver');

    // 2 — Authentication Lifecycle Sync
    useEffect(() => {
        const unsubscribe = subscribeToAuthChanges((currentUser) => {
            if (currentUser) {
                console.log(`[App] Auth Update: ${currentUser.email}`);
                setUser(currentUser);
                setAuthLoading(false);
                // Sync Firebase ID Token to localStorage so all backend API calls
                // can attach it as a Bearer token (fixes 401 on every API call)
                syncWithBackend().catch(e => console.warn('[Auth] Token sync failed:', e));
            } else {
                setUser(null);
                setAuthLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // 3 — Firestore Real-time Collections Sync (Orders & Drivers)
    useEffect(() => {
        const unsubscribeOrders = subscribeToOrders((newOrders) => {
            if (newOrders && newOrders.length > 0) {
                setOrders(newOrders);
            } else {
                const saved = getFromStorage(STORAGE_KEYS.MASTER_ORDERS);
                setOrders(saved && saved.length > 0 ? saved : mockOrders);
            }
        });

        const unsubscribeDrivers = subscribeToDrivers((newDrivers) => {
            setDrivers(newDrivers);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeDrivers();
        };
    }, []);

    // 4 — Local Storage Hydration
    useEffect(() => {
        const savedRoute = getFromStorage('route_active');
        if (savedRoute) setRoute(savedRoute);

        const savedIndex = getFromStorage('route_index');
        if (savedIndex !== null) setCurrentStopIndex(Number(savedIndex));

        const savedStatus = getFromStorage('route_status');
        if (savedStatus) setRouteStatus(savedStatus);

        initializeDefaultStorage();
    }, []);

    // 5 — Real-time Traffic Simulation Engine
    useEffect(() => {
        const interval = setInterval(() => {
            const newMultiplier = generateNextTrafficMultiplier();
            setTrafficMultiplier(newMultiplier);
            setRouteStatus(getTrafficStatusLabel(newMultiplier));
        }, TRAFFIC_CONFIG.UPDATE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, []);

    // 6 — Rule-Based Decision Engine: Autonomous Recalculation Flow
    useEffect(() => {
        if (!route || route.length === 0 || isCalculating) return;

        const predictedTotalDelay = calculatePredictedDelay(route.slice(currentStopIndex), trafficMultiplier, delayHistory);
        setDelayMinutes(predictedTotalDelay);

        const hasHighPriorityRemaining = route.slice(currentStopIndex).some(s => s.priority > 5);
        const reason = evaluateRouteHealth(predictedTotalDelay, hasHighPriorityRemaining, trafficMultiplier, lastRecalcTime);

        if (reason) {
            setLastRecalcTime(Date.now());
            handleRecalculateRoute();
        }
    }, [trafficMultiplier, route, currentStopIndex, isCalculating, delayHistory]);

    // 7 — Persistence & Stats Middleware
    useEffect(() => {
        if (user) saveToStorage(STORAGE_KEYS.USER_PROFILE, user);
        saveToStorage(STORAGE_KEYS.MASTER_ORDERS, orders);
        saveToStorage(STORAGE_KEYS.ACTIVE_ROUTE, route);
        saveToStorage(STORAGE_KEYS.CURRENT_INDEX, currentStopIndex);
        saveToStorage(STORAGE_KEYS.ROUTE_STATUS, routeStatus);

        const { fuel, carbon } = computeLiveStats(orders, stats, trafficMultiplier);
        setStats(prev => ({ ...prev, fuel, carbon }));
    }, [orders, user, route, currentStopIndex, routeStatus, trafficMultiplier]);

    const handleRecalculateRoute = async () => {
        if (isCalculating) return;
        setIsCalculating(true);
        try {
            const result = await recalculateSystemRoute({
                orders,
                route,
                drivers,
                liveLocation,
                currentStopIndex
            });
            if (result && result.route) {
                setRoute(result.route);
                saveToStorage('route_active', result.route);
                
                if (result.stats) {
                    setStats(prev => ({
                        ...prev,
                        ...result.stats
                    }));
                }
            }
        } catch (error) {
            console.error("Critical Optimization failed:", error);
        } finally {
            setIsCalculating(false);
        }
    };

    // Auto-Optimize when data drift detected (Missing stops or unassigned fleet)
    useEffect(() => {
        const pendingOrders = orders.filter(o => o.status === 'Pending');
        if (pendingOrders.length === 0) return;

        // Check if all pending orders are present in the active route
        const activeRouteStopIds = new Set(route.map(s => String(s.id)));
        const allPendingHandled = pendingOrders.every(o => activeRouteStopIds.has(String(o.id)));
        
        // Detection: Is the fleet multi-driver? If so, does the route reflect that?
        const uniqueDriversInRoute = new Set(
            route.filter(s => s.driverId && !String(s.id).startsWith('HQ')).map(s => s.driverId)
        );
        const isFleetCollapsed = drivers.length > 1 && uniqueDriversInRoute.size === 1;

        // Condition for skip: All orders handled, route exists, and fleet is distributed correctly
        if (allPendingHandled && route.length > 0 && !isFleetCollapsed) return;

        const now = Date.now();
        if (now - lastRecalcTime < 5000) return;

        const timer = setTimeout(() => { 
            setLastRecalcTime(Date.now());
            handleRecalculateRoute(); 
        }, 1800);
        return () => clearTimeout(timer);
    }, [JSON.stringify(orders.map(o => ({id: o.id, status: o.status}))), route.length, drivers.length, lastRecalcTime]);

    // 7 — Event Handlers & Data Mutations
    const handleLogin = (u) => { setUser(u); u.role === 'admin' ? navigate('/admin') : navigate('/driver'); };
    const handleLogout = async () => {
        try { 
            await firebaseLogout(); 
            logoutFromBackend(); // Clear backend JWT session
            setUser(null); 
            setUserOverrideRole(null); 
            localStorage.removeItem('route_user'); 
            navigate('/login'); 
        }
        catch (e) { console.error("Logout error", e); }
    };


    const handleAddOrder = (o) => firebaseAddOrder(o).catch(e => console.error(e));
    const handleAddDriver = (d) => firebaseAddDriver(d).catch(e => console.error(e));
    const handleUpdateDriver = (id, up) => firebaseUpdateDriver(id, up).catch(e => console.error(e));
    const handleDeleteDriver = (id) => firebaseDeleteDriver(id).catch(e => console.error(e));

    const handleCompleteOrder = async (id) => {
        // Special logic for base-return/start nodes that aren't in Firestore
        if (id.toString().startsWith('HQ')) {
            setRoute(p => p.map(o => o.id === id ? { ...o, status: 'Completed' } : o));
            return;
        }
        const o = orders.find(ord => ord.id === id);
        if (o) {
            try {
                if (!id.toString().startsWith('ORD')) await updateOrder(id, { status: 'Completed' });
                else setOrders(p => p.map(ord => ord.id === id ? { ...ord, status: 'Completed' } : ord));
            } catch (e) { setOrders(p => p.map(ord => ord.id === id ? { ...ord, status: 'Completed' } : ord)); }
        }
    };

    const handleDeleteOrder = (id) => {
        if (!id.toString().startsWith('ORD')) firebaseDeleteOrder(id).catch(e => console.error(e));
        else setOrders(p => p.filter(o => o.id !== id));
    };

    const handleManualRecalculate = async () => { // Single-driver iterative refinement
        const savedSettings = JSON.parse(localStorage.getItem('route_settings')) || {};
        const loc = liveLocation || { 
            lat: parseFloat(savedSettings.officeLat) || 13.0827, 
            lng: parseFloat(savedSettings.officeLng) || 80.2707 
        };
        setIsCalculating(true);
        try {
            const up = await optimizeWithPersistentHistory(loc, route, currentStopIndex, { vehicleConsumptionRate: 0.15 });
            setRoute(up);
        } catch (e) { console.error(e); }
        finally { setIsCalculating(false); }
    };

    const toggleRole = () => { // Simulation toggle for Admins
        const next = (userOverrideRole || user.role) === 'admin' ? 'driver' : 'admin';
        setUserOverrideRole(next);
        navigate(next === 'admin' ? '/admin' : '/driver');
    };

    // 8 — Rendering Logic & Routing Map
    if (authLoading) return <div className="loading-screen">Synchronizing Fleet Security...</div>;

    return (
        <Routes>
            <Route path="/" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/driver'} /> : <Navigate to="/login" />} />
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage key="login" onLogin={handleLogin} mode="login" />} />
            <Route path="/signup" element={user ? <Navigate to="/" replace /> : <LoginPage key="signup" onLogin={handleLogin} mode="signup" />} />

            <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
            <Route path="/admin/:tab" element={<AdminRouteWrapper {...{user, orders, route, setRoute, isCalculating, onRecalculate: handleRecalculateRoute, onAddOrder: handleAddOrder, onDeleteOrder: handleDeleteOrder, onLogout: handleLogout, onToggleRole: toggleRole, drivers, onAddDriver: handleAddDriver, onUpdateDriver: handleUpdateDriver, onDeleteDriver: handleDeleteDriver, gpsStatus, stats}} overrideRole={userOverrideRole} loading={authLoading} />} />
            <Route path="/admin/:tab/:id" element={<AdminRouteWrapper {...{user, orders, route, setRoute, isCalculating, onRecalculate: handleRecalculateRoute, onAddOrder: handleAddOrder, onDeleteOrder: handleDeleteOrder, onLogout: handleLogout, onToggleRole: toggleRole, drivers, onAddDriver: handleAddDriver, onUpdateDriver: handleUpdateDriver, onDeleteDriver: handleDeleteDriver, gpsStatus, stats}} overrideRole={userOverrideRole} loading={authLoading} />} />



            <Route path="/driver" element={
                <ProtectedRoute user={user} overrideRole={userOverrideRole} allowedRole="driver" loading={authLoading}>
                    {(() => {
                        // Driver View sub-routing: Admins see specific selected driver fleets
                        const isSim = (user?.role === 'admin' && userOverrideRole === 'driver');
                        const idsInRoute = Array.from(new Set(route.map(o => o.driverId).filter(Boolean)));
                        const targetId = isSim ? (selectedSimulatedDriverId || idsInRoute[0]) : user?.uid;

                        // Fleet switcher logic for admin simulation
                        const handleCycle = () => {
                            if (!isSim || idsInRoute.length <= 1) return;
                            const cur = idsInRoute.indexOf(targetId);
                            setSelectedSimulatedDriverId(idsInRoute[(cur + 1) % idsInRoute.length]);
                        };

                        return (
                            <DriverView
                                orders={orders.filter(o => isSim ? o.driverId === targetId : (o.driverId === user?.uid || drivers.find(d => d.id === o.driverId)?.uid === user?.uid))}
                                route={route.filter(o => isSim ? o.driverId === targetId : (o.driverId === user?.uid || drivers.find(d => d.id === o.driverId)?.uid === user?.uid))}
                                driverId={targetId} currentStopIndex={currentStopIndex} setCurrentStopIndex={setCurrentStopIndex}
                                routeStatus={routeStatus} 
                                trafficMultiplier={trafficMultiplier} 
                                delayMinutes={delayMinutes} 
                                setDelayMinutes={setDelayMinutes}
                                recalculateRoute={handleManualRecalculate} liveLocation={liveLocation} gpsStatus={gpsStatus} onComplete={handleCompleteOrder}
                                onToggleRole={toggleRole} onLogout={handleLogout} onCycleFleet={isSim && idsInRoute.length > 1 ? handleCycle : null}
                            />
                        );
                    })()}
                </ProtectedRoute>
            } />
        </Routes>
    );
}

// Global App Wrapper with Router Context
export default function App() { return <Router><AppContent /></Router>; }
