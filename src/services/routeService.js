import { optimizeVRP, optimizeRoute } from '../logic/optimizer';

/**
 * Orchestrates the recalculation of the delivery route.
 */
export const recalculateSystemRoute = async ({
    orders,
    route,
    drivers,
    liveLocation,
    currentStopIndex
}) => {
    if (orders.length === 0) return null;

    const completedStops = route.filter(s => s.status === 'Completed');
    const pendingOrders = orders.filter(o => o.status === 'Pending');

    if (pendingOrders.length === 0) return null;

    const savedSettings = JSON.parse(localStorage.getItem('route_settings')) || {};
    const officeLocation = {
        lat: parseFloat(savedSettings.officeLat) || 13.0827,
        lng: parseFloat(savedSettings.officeLng) || 80.2707,
        id: 'OFFICE-DEPOT',
        customer: 'Smart Depot'
    };

    const startPoint = liveLocation || (completedStops.length > 0 ? completedStops[completedStops.length - 1] : officeLocation);
    
    const dynamicOffice = {
        ...officeLocation,
        lat: startPoint.lat,
        lng: startPoint.lng
    };

    const vehicles = (drivers && drivers.length > 0 ? drivers : [{ id: 'DRV-001' }]).map(d => ({
        vehicle_id: d.id,
        capacity: parseInt(d.capacity) || 100,
        fuel_type: d.fuelType || 'Diesel',
        consumption_liters_per_100km: parseFloat(d.consumption) || 12.0,
        driver_hourly_wage: parseFloat(d.hourlyWage) || 250.0,
        idle_cost_per_hour: parseFloat(d.idleCost) || 50.0
    }));

    const stopsToOptimize = pendingOrders.map(o => ({
        lat: o.lat, lng: o.lng, id: o.id.toString(),
        name: o.customer || 'Client', demand_units: parseInt(o.weight) || 1,
        service_time_minutes: parseInt(savedSettings.serviceTimeMin) || 10,
        time_window_start: 0, time_window_end: 86400,
        status: o.status || 'Pending',
        priority: o.priority === 'High' ? 10 : (o.priority === 'Medium' ? 5 : 1)
    }));

    try {
        const result = await optimizeVRP(dynamicOffice, vehicles, stopsToOptimize);

        if (result && result.routes && result.routes.length > 0) {
            let newPartialRoute = [];
            result.routes.forEach(vr => {
                newPartialRoute = [...newPartialRoute, ...vr.stops.map(s => ({
                    ...s,
                    driverId: vr.vehicle_id
                }))];
            });

            const finalRoute = [
                ...completedStops, 
                ...newPartialRoute.filter(s => !String(s.id).startsWith('HQ'))
            ];

            return {
                route: finalRoute,
                stats: {
                    total_distance_km: result.summary?.total_distance_km,
                    total_duration_min: result.summary?.total_duration_min,
                    total_cost: result.summary?.total_cost,
                    fuel: result.summary?.total_fuel_litres,
                    optimization_score: result.optimization_score,
                    vehicles_used: result.summary?.total_vehicles_used,
                    breakdown: {
                        fuel: result.cost_breakdown?.Fuel,
                        labor: result.cost_breakdown?.Labour
                    }
                }
            };
        } else {
            // Local Fallback
            const groups = {};
            const fleet = vehicles.length > 0 ? vehicles : [{ id: 'DRV-001' }];
            
            pendingOrders.forEach((o, i) => {
                const fid = fleet[i % fleet.length].vehicle_id;
                if (!groups[fid]) groups[fid] = [];
                groups[fid].push(o);
            });

            let fallbackPartial = [];
            for (const fid in groups) {
                const res = await optimizeRoute(startPoint, groups[fid]);
                fallbackPartial = [...fallbackPartial, ...res.orderedRoute.map(s => ({...s, driverId: fid}))];
            }

            const finalRoute = [...completedStops, ...fallbackPartial.filter(s => !String(s.id).startsWith('HQ'))];
            return {
                route: finalRoute,
                stats: {
                    total_distance_km: (finalRoute.length * 4.2).toFixed(1), // Rough estimate
                    total_cost: (finalRoute.length * 150).toFixed(0),
                    optimization_score: 65,
                    status: 'Fallback'
                }
            };
        }
    } catch (error) {
        console.error("Critical Route Optimization Failure:", error);
        throw error;
    }
};
