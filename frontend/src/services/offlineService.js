import Dexie from 'dexie';

/**
 * ORION-ELITE Offline Support — Phase 4
 * Uses Dexie (IndexedDB wrapper) to persist route data locally on the driver's device.
 * This ensures that if network connectivity is lost in remote areas, the driver
 * still has access to their current route and stop sequence.
 */

const db = new Dexie('RoutenizzOfflineDB');

db.version(1).stores({
  routes: 'id, vehicleId, updatedAt',
  orders: 'id, routeId, status',
  telemetry: '++id, timestamp, vehicleId'
});

/**
 * Persists the full route object to local IndexedDB.
 */
export const cacheRoute = async (route) => {
  if (!route) return;
  try {
    await db.routes.put({
      ...route,
      updatedAt: new Date().toISOString()
    });
    console.log(`[Offline] Cached route for vehicle: ${route.vehicleId}`);
  } catch (error) {
    console.error('[Offline] Failed to cache route:', error);
  }
};

/**
 * Retrieves all cached routes from local storage.
 */
export const getOfflineRoutes = async () => {
  try {
    return await db.routes.toArray();
  } catch (error) {
    console.error('[Offline] Failed to retrieve cached routes:', error);
    return [];
  }
};

/**
 * Retrieves a specific route by vehicle ID.
 */
export const getOfflineRouteByVehicle = async (vehicleId) => {
  try {
    return await db.routes.get({ vehicleId });
  } catch (error) {
    console.error(`[Offline] Failed to retrieve route for ${vehicleId}:`, error);
    return null;
  }
};

/**
 * Stores telemetry heartbeat locally when offline.
 */
export const queueTelemetry = async (data) => {
  try {
    await db.telemetry.add({
      ...data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Offline] Failed to queue telemetry:', error);
  }
};

/**
 * Clears old data.
 */
export const clearOldCache = async () => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    await db.routes.where('updatedAt').below(oneDayAgo).delete();
  } catch (error) {
    console.error('[Offline] Cache cleanup failed:', error);
  }
};

export default db;
