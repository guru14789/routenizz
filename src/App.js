/**
 * USES: Main React application component and routing hub.
 * SUPPORT: Manages global application state (user auth, orders, routes), initializes live GPS tracking, and handles top-level navigation between Admin and Driver views.
 */
import React, { useState, useEffect } from 'react'; // React core for component lifecycle and state
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'; // SPA routing utilities
import DriverView from './components/DriverView'; // Main interface for the delivery driver
import LoginPage from './pages/LoginPage'; // User authentication (Admin/Driver) landing
import AdminPage from './pages/AdminPage'; // Global fleet management and routing dashboard
import { mockOrders } from './data/mockOrders'; // Fallback static data for development/demo
import { initializeDefaultStorage } from "./utils/storage"; // Helper to ensure LocalStorage structure
import { optimizeRoute, optimizeWithPersistentHistory, optimizeVRP } from './logic/optimizer'; // Optimization algorithm controllers
import { calculateFuelConsumption, calculateCarbonFootprint } from './logic/fuelCalculator'; // Eco-logic for stats
import { saveToStorage, getFromStorage } from './utils/storage'; // Persistence utility for browser reloads
import { getCurrentTrafficZone, getTrafficMultiplier } from "./data/trafficData"; // Local traffic simulation data
import './index.css'; // Main application styling entry point

// Protected Route Component Definition
// Ensures only authenticated users can access specific sections based on their assigned role
const ProtectedRoute = ({ children, allowedRole, user, overrideRole }) => {
    if (!user) return <Navigate to="/login" replace />; // Redirect to login if user object is null

    // Effective role allows admins to simulate being a driver for testing purposes
    const effectiveRole = overrideRole || user.role;

    // RBAC: Role-Based Access Control logic
    if (allowedRole && effectiveRole !== allowedRole) {
        return <Navigate to={effectiveRole === 'admin' ? '/admin' : '/driver'} replace />;
    }
    return children; // Access granted
};

// Firebase Data Management Imports
import {
    subscribeToAuthChanges,
    logout as firebaseLogout,
    subscribeToOrders,
    addOrder as firebaseAddOrder,
    deleteOrder as firebaseDeleteOrder,
    updateOrder,
    subscribeToDrivers,
    addDriver as firebaseAddDriver,
    updateDriver as firebaseUpdateDriver
} from './services/firebaseService';

function AppContent() { // Inner component to access the useNavigate hook
    // State Initialization: Application data layer
    const [user, setUser] = useState(null); // Current authenticated user Profile
    const [userOverrideRole, setUserOverrideRole] = useState(null); // Driver simulation toggle
    const [orders, setOrders] = useState([]); // Master list of delivery orders
    const [route, setRoute] = useState([]); // The currently calculated sequence of stops
    const [currentStopIndex, setCurrentStopIndex] = useState(0); // Progress tracker for driver mission
    const [routeStatus, setRouteStatus] = useState('On Time'); // High-level status for telemetry
    const [delayMinutes, setDelayMinutes] = useState(0); // Accuracy factor for ETA
    const [stats, setStats] = useState({ fuel: 0, carbon: 0, total_cost: 0, breakdown: null }); // Performance metrics
    const [isCalculating, setIsCalculating] = useState(false); // Global loading state for optimization runs
    const [liveLocation, setLiveLocation] = useState(null); // Real-time GPS coordinates of the device
    const [gpsStatus, setGpsStatus] = useState('Searching'); // UI indicator for location sensor health
    const [drivers, setDrivers] = useState([]); // Fleet assets list for VRP multi-driver slotting
    const [selectedSimulatedDriverId, setSelectedSimulatedDriverId] = useState(null); // View control for simulations
    const navigate = useNavigate(); // React Router hook for programmatic redirects

    // 1 — Authentication Lifecycle Sync
    useEffect(() => {
        const unsubscribe = subscribeToAuthChanges((currentUser) => {
            setUser(currentUser); // Update local user state from Firebase broadcast
            if (currentUser && (window.location.pathname === '/login' || window.location.pathname === '/' || window.location.pathname === '/signup')) {
                navigate(currentUser.role === 'admin' ? '/admin' : '/driver'); // Redirect on login success
            }
        });
        return () => unsubscribe(); // Cleanup listener on unmount
    }, [navigate]);

    // 2 — Firestore Real-time Collections Sync (Orders & Drivers)
    useEffect(() => {
        const unsubscribeOrders = subscribeToOrders((newOrders) => {
            if (newOrders && newOrders.length > 0) {
                setOrders(newOrders); // Push fresh cloud data to local state
            } else {
                const saved = getFromStorage('route_orders');
                setOrders(saved && saved.length > 0 ? saved : mockOrders); // Fallback to memory or mock
            }
        });

        const unsubscribeDrivers = subscribeToDrivers((newDrivers) => {
            setDrivers(newDrivers); // Sync driver fleet definitions
        });

        return () => {
            unsubscribeOrders();
            unsubscribeDrivers();
        };
    }, []);

    // 3 — Local Storage Hydration (Persistent Session across Refreshes)
    useEffect(() => {
        const savedRoute = getFromStorage('route_active');
        if (savedRoute) setRoute(savedRoute);

        const savedIndex = getFromStorage('route_index');
        if (savedIndex !== null) setCurrentStopIndex(Number(savedIndex));

        const savedStatus = getFromStorage('route_status');
        if (savedStatus) setRouteStatus(savedStatus);

        initializeDefaultStorage(); // Ensure base keys exist in LocalStorage
    }, []);

    // 4 — Real-time Geolocation Hardware Watcher
    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsStatus('Incompatible'); // Browser doesn't support Location API
            return;
        }

        const startGpsWatch = (highAccuracy = true) => {
            return navigator.geolocation.watchPosition(
                (pos) => {
                    setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setGpsStatus('Active'); // Successfully streaming coordinates
                },
                (err) => {
                    console.warn(`GPS(${highAccuracy ? 'High' : 'Low'}):`, err.message);
                    if (err.code === 3 && highAccuracy) { // Timeout on GPS fix
                        setGpsStatus('Searching (Low Accuracy)...');
                        navigator.geolocation.clearWatch(watchId); // Switch to cell tower/wifi location
                        watchId = startGpsWatch(false);
                    } else {
                        // Map hardware error codes to human-readable UI messages
                        if (err.code === 1) setGpsStatus('Permission Denied');
                        else if (err.code === 2) setGpsStatus('Location Unavailable');
                        else if (err.code === 3) setGpsStatus('Search Timeout');
                    }
                },
                { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 10000 }
            );
        };

        let watchId = startGpsWatch(true); // Initiate high-accuracy stream
        return () => { if (watchId) navigator.geolocation.clearWatch(watchId); }; // Teardown hardware listener
    }, []);

    // 5 — Local Persistence Middleware (Save UI changes to LocalStorage)
    useEffect(() => {
        if (user) saveToStorage('route_user', user);
        saveToStorage('route_orders', orders);
        saveToStorage('route_active', route);
        saveToStorage('route_index', currentStopIndex);
        saveToStorage('route_status', routeStatus);

        // Stats calculation — use actual route distance where available,
        // fall back to a per-stop heuristic only when no route exists yet.
        const safeOrders = Array.isArray(orders) ? orders : [];
        const routeDistance = stats.totalDistance || (safeOrders.length * 5);
        const currentZone = getCurrentTrafficZone() || "low";
        const trafficMultiplier = getTrafficMultiplier(currentZone) || 1.0;
        const baseFuel = calculateFuelConsumption(routeDistance, 1.0, 0.15) || 0;
        const fuel = baseFuel * trafficMultiplier;
        const carbon = calculateCarbonFootprint(fuel) || 0;

        setStats(prev => ({ // Update visual KPI stats
            ...prev,
            fuel: (fuel || 0).toFixed(2),
            carbon: (carbon || 0).toFixed(2)
        }));
    }, [orders, user, route, currentStopIndex, routeStatus]);

    // 6 — Enterprise Route Optimization Orchestrator (VRP Service Call)
    const handleRecalculateRoute = async () => {
        if (orders.length === 0) return;

        setIsCalculating(true); // Show spinner/overlay
        try {
            const pending = orders.filter(o => o.status === 'Pending');
            if (pending.length > 0) {
                const savedSettings = JSON.parse(localStorage.getItem('route_settings')) || {};
                const officeLocation = {
                    lat: parseFloat(savedSettings.officeLat) || 13.0827,
                    lng: parseFloat(savedSettings.officeLng) || 80.2707,
                    id: 'OFFICE-DEPOT',
                    customer: 'Smart Depot'
                };

                // Map fleet to backend protocol
                const vehicles = (drivers && drivers.length > 0 ? drivers : [{ id: 'DRV-001' }]).map(d => ({
                    vehicle_id: d.id,
                    capacity: parseInt(d.capacity) || 100,
                    fuel_type: d.fuelType || 'Diesel',
                    consumption_liters_per_100km: parseFloat(d.consumption) || 12.0,
                    driver_hourly_wage: parseFloat(d.hourlyWage) || 250.0,
                    idle_cost_per_hour: parseFloat(d.idleCost) || 50.0
                }));

                // Map tasks to backend protocol
                const stops = pending.map(o => ({
                    lat: o.lat, lng: o.lng, id: o.id.toString(),
                    customer: o.customer || 'Client', demand_units: parseInt(o.weight) || 1,
                    service_time_minutes: parseInt(savedSettings.serviceTimeMin) || 10,
                    time_window_start: 0, time_window_end: 86400
                }));

                // Call the Cloud Optimizer Service
                const result = await optimizeVRP(officeLocation, vehicles, stops);

                if (result && result.vehicles) { // Success: Multi-vehicle solution received
                    let newGlobalRoute = [];
                    result.vehicles.forEach(vr => {
                        newGlobalRoute = [...newGlobalRoute, ...vr.ordered_stops];
                    });
                    setRoute(newGlobalRoute);
                    saveToStorage('route_active', newGlobalRoute);
                    setStats(prev => ({ ...prev, total_cost: result.total_cost, breakdown: result.cost_breakdown }));
                } else { // Fallback: Run local Greedy-TSP algorithm if server is unreachable
                    console.warn("VRP failed. Falling back to local optimization.");
                    const groups = {}; // Simple driver assignment grouping
                    pending.forEach(o => {
                        const gid = o.driverId || 'unassigned';
                        if (!groups[gid]) groups[gid] = [];
                        groups[gid].push(o);
                    });
                    let fallbackRoute = [];
                    for (const gid in groups) {
                        if (gid === 'unassigned') continue;
                        const res = await optimizeRoute(officeLocation, groups[gid]);
                        fallbackRoute = [...fallbackRoute, ...res.orderedRoute];
                    }
                    setRoute(fallbackRoute);
                }
            }
        } catch (error) { console.error("Optimization failed:", error); }
        finally { setIsCalculating(false); }
    };

    // Auto-Optimize when PENDING order count changes (not on every status update).
    // Debounced 800ms to avoid firing on rapid Firestore batch syncs.
    useEffect(() => {
        const pendingCount = orders.filter(o => o.status === 'Pending').length;
        if (pendingCount === 0) return;

        const timer = setTimeout(() => { handleRecalculateRoute(); }, 800);
        return () => clearTimeout(timer);
    }, [orders.filter(o => o.status === 'Pending').length]); // eslint-disable-line react-hooks/exhaustive-deps

    // 7 — Event Handlers & Data Mutations
    const handleLogin = (u) => { setUser(u); u.role === 'admin' ? navigate('/admin') : navigate('/driver'); };
    const handleLogout = async () => {
        try { await firebaseLogout(); setUser(null); setUserOverrideRole(null); localStorage.removeItem('route_user'); navigate('/login'); }
        catch (e) { console.error("Logout error", e); }
    };

    const handleAddOrder = (o) => firebaseAddOrder(o).catch(e => console.error(e));
    const handleAddDriver = (d) => firebaseAddDriver(d).catch(e => console.error(e));
    const handleUpdateDriver = (id, up) => firebaseUpdateDriver(id, up).catch(e => console.error(e));

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
        const loc = liveLocation || { lat: 11.0175, lng: 76.9681 };
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
    return (
        <Routes>
            <Route path="/" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/driver'} /> : <Navigate to="/login" />} />
            <Route path="/login" element={<LoginPage onLogin={handleLogin} mode="login" />} />
            <Route path="/signup" element={<LoginPage onLogin={handleLogin} mode="signup" />} />

            <Route path="/admin" element={
                <ProtectedRoute user={user} overrideRole={userOverrideRole} allowedRole="admin">
                    <AdminPage orders={orders} route={route} setRoute={setRoute} isCalculating={isCalculating} onRecalculate={handleRecalculateRoute} onAddOrder={handleAddOrder} onDeleteOrder={handleDeleteOrder} onLogout={handleLogout} onToggleRole={toggleRole} drivers={drivers} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} gpsStatus={gpsStatus} />
                </ProtectedRoute>
            } />

            <Route path="/driver" element={
                <ProtectedRoute user={user} overrideRole={userOverrideRole} allowedRole="driver">
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
                                routeStatus={routeStatus} setRouteStatus={setRouteStatus} delayMinutes={delayMinutes} setDelayMinutes={setDelayMinutes}
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
