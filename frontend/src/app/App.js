/**
 * USES: Main React application component and routing hub.
 * SUPPORT: Manages global application state (user auth, orders, routes), initializes live GPS tracking, and handles top-level navigation between Admin and Driver views.
 */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppProvider } from '@app/context/AppProvider';
import { useAuth } from '@app/context/AuthContext';
import { useLogistics } from '@app/context/LogisticsContext';
import { useTraffic } from '@app/context/TrafficContext';
import DriverView from '@features/driver/DriverView';
import AdminPage from '@pages/AdminPage';
import AdminAuthPage from '@pages/AdminAuthPage';
import DriverLoginPage from '@pages/DriverLoginPage';
import '@shared/styles/index.css';

// Protected Route Component Definition
const ProtectedRoute = ({ children, allowedRole }) => {
    const { user, activeRole, authLoading } = useAuth();

    if (authLoading) return <div className="loading-screen">Authenticating TNImpact...</div>;
    if (!user) return <Navigate to="/login" replace />; 

    if (allowedRole && activeRole !== allowedRole) {
        console.warn(`[Auth Guard] Path requires ${allowedRole}, but user is ${activeRole}. Redirecting...`);
        return <Navigate to={activeRole === 'admin' ? '/admin' : '/driver'} replace />;
    }
    return children; 
};

// Firebase Data Management Imports
import { 
    logout as firebaseLogout, 
    addOrder as firebaseAddOrder, 
    addDriver as firebaseAddDriver, 
    updateDriver as firebaseUpdateDriver, 
    deleteDriver as firebaseDeleteDriver,
    deleteOrder as firebaseDeleteOrder,
    updateOrder
} from '@services/firebaseService';
import { logout as backendLogout, getAuthHeaders } from '@services/backendAuthService';
import { API_BASE } from '@app/config';
import { optimizeWithPersistentHistory } from '@shared/logic/optimizer';
import { 
    saveToStorage, 
    STORAGE_KEYS
} from '@services/storageService';
import { 
    calculatePredictedDelay, 
    evaluateRouteHealth 
} from '@shared/logic/decisionEngine';
import { 
    computeLiveStats 
} from '@shared/logic/statsCalculator';
import { 
    recalculateSystemRoute 
} from '@services/routeService';
import { useGps } from '@shared/hooks/useGps';

function AdminRouteWrapper(props) {
    return (
        <ProtectedRoute allowedRole="admin">
            <AdminPage {...props} />
        </ProtectedRoute>
    );
}

function AppContent() {
    const { user, setUser, activeRole, setUserOverrideRole, userOverrideRole, authLoading } = useAuth();
    const { 
        orders, setOrders, drivers, route, setRoute, routeStatus, setRouteStatus,
        isCalculating, setIsCalculating 
    } = useLogistics();
    const { trafficMultiplier, trafficStatus } = useTraffic();

    const [selectedSimulatedDriverId, setSelectedSimulatedDriverId] = useState(null);

    const [currentStopIndex, setCurrentStopIndex] = useState(0);
    const [delayMinutes, setDelayMinutes] = useState(0);
    const [delayHistory, setDelayHistory] = useState([]);
    const [lastRecalcTime, setLastRecalcTime] = useState(0);
    const [stats, setStats] = useState({ fuel: 0, carbon: 0, total_cost: 0, breakdown: null });
    const [weatherSummary, setWeatherSummary] = useState(null);  // From last VRP solve: { severity, worst_condition, max_multiplier, ... }
    
    const navigate = useNavigate();

    // Geolocation & Tracking
    const { liveLocation, gpsStatus } = useGps(activeRole === 'driver');

    // Rule-Based Decision Engine: Autonomous Recalculation Flow
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
    useEffect(() => {
        if (orders && orders.length > 0) {
            const { fuel, carbon } = computeLiveStats(orders, stats, trafficMultiplier);
            setStats(prev => ({ ...prev, fuel, carbon }));
        } else {
            // Reset stats if no orders exist
            setStats({ fuel: 0, carbon: 0, total_cost: 0, breakdown: null });
        }
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
                // Capture weather intelligence from the solver response
                if (result.weather_summary) {
                    setWeatherSummary(result.weather_summary);
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
    const handleLogin = (u, selectedRole) => { 
        const roleToUse = selectedRole || u.role || 'driver';
        setUser({ ...u, role: roleToUse }); 
        roleToUse === 'admin' ? navigate('/admin') : navigate('/driver'); 
    };
    const handleLogout = async () => {
        try { 
            await firebaseLogout(); 
            backendLogout(); // Clear backend JWT session
            setUser(null); 
            setUserOverrideRole(null); 
            localStorage.removeItem('route_user'); 
            navigate('/login'); 
        }
        catch (e) { console.error("Logout error", e); }
    };


    const handleAddOrder = async (o) => {
        try {
            // 1. Sync to Backend (SQLite) for VRP and persistent history
            const response = await fetch(`${API_BASE}/api/v1/admin/add-order`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customer_name: o.customer_name,
                    destination_lat: parseFloat(o.destination_lat),
                    destination_lng: parseFloat(o.destination_lng),
                    priority: parseInt(o.priority) || 5,
                    stop_type: o.stop_type || 'Residential',
                    weight_kg: parseFloat(o.weight_kg) || 0,
                    volume_m3: parseFloat(o.volume_m3) || 0,
                    time_window_end: 86400 
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Backend registration failed:", errorData);
            }

            // 2. Sync to Firebase for real-time dispatch updates
            await firebaseAddOrder(o);
        } catch (e) {
            console.error("Critical: Order registration failed:", e);
        }
    };
    const handleAddDriver = async (d) => {
        try {
            // Map frontend fields to backend schema
            const backendData = {
                email: d.email,
                full_name: d.name,
                phone: d.phone,
                vehicle_id: d.id, 
                vehicle_type: d.vehicleType,
                vehicle_number: d.vehicleNumber,
                capacity: parseInt(d.maxLoad) || 10,
                weight_capacity_kg: parseFloat(d.maxLoad || 0) || 1000.0,
                volume_capacity_m3: (parseFloat(d.height || 0) * parseFloat(d.width || 0) * parseFloat(d.breadth || 0)) / 1000000 || 10.0,
                consumption: parseFloat(d.consumption || 0) || 12.0,
                hourly_wage: parseFloat(d.hourlyWage || 0) || 250.0,
                idle_cost: parseFloat(d.idleCost || 0) || 50.0,
                fuel_type: d.fuelType || "Diesel",
                documents: d.documents || []
            };

            // 1. Sync to Backend (SQLite)
            const response = await fetch(`${API_BASE}/api/v1/admin/add-driver`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(backendData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to add driver');
            }

            const data = await response.json();
            // Update local state with the generated PIN and employee number
            const driverWithPin = { 
                ...d, 
                pin: data.credentials.pin,
                employee_number: data.credentials.employee_number || d.employee_number 
            };
            
            // Add to Firestore for real-time sync across other admin views
            await firebaseAddDriver(driverWithPin);
            return driverWithPin;
        } catch (e) {
            console.error("Error adding driver:", e);
            alert(e.message);
        }
    };
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
            <Route path="/" element={user ? <Navigate to={(userOverrideRole || user.role) === 'admin' ? '/admin' : '/driver'} /> : <Navigate to="/admin-login" />} />
            <Route path="/login" element={<Navigate to="/admin-login" replace />} />
            <Route path="/admin-login" element={user ? <Navigate to="/" replace /> : <AdminAuthPage onAuthSuccess={handleLogin} />} />
            <Route path="/driver-login" element={user ? <Navigate to="/" replace /> : <DriverLoginPage onAuthSuccess={handleLogin} />} />
            <Route path="/signup" element={<Navigate to="/admin-login" replace />} />

            <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
            <Route path="/admin/:tab" element={<AdminRouteWrapper {...{user, orders, route, setRoute, isCalculating, onRecalculate: handleRecalculateRoute, onAddOrder: handleAddOrder, onDeleteOrder: handleDeleteOrder, onLogout: handleLogout, onToggleRole: toggleRole, drivers, onAddDriver: handleAddDriver, onUpdateDriver: handleUpdateDriver, onDeleteDriver: handleDeleteDriver, gpsStatus, stats, weatherSummary}} overrideRole={userOverrideRole} loading={authLoading} />} />
            <Route path="/admin/:tab/:id" element={<AdminRouteWrapper {...{user, orders, route, setRoute, isCalculating, onRecalculate: handleRecalculateRoute, onAddOrder: handleAddOrder, onDeleteOrder: handleDeleteOrder, onLogout: handleLogout, onToggleRole: toggleRole, drivers, onAddDriver: handleAddDriver, onUpdateDriver: handleUpdateDriver, onDeleteDriver: handleDeleteDriver, gpsStatus, stats, weatherSummary}} overrideRole={userOverrideRole} loading={authLoading} />} />



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
export default function App() { return <Router><AppProvider><AppContent /></AppProvider></Router>; }
