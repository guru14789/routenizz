/**
 * USES: System-wide administrative settings.
 * SUPPORT: Configures global parameters such as depot location (Office HQ), service times per stop, and default vehicle consumption rates.
 */
import React, { useState } from 'react';
import { addOrder, addDriver } from '../services/firebaseService';
import './SettingsPane.css';

const SettingsPane = () => {
    const [isSeeding, setIsSeeding] = useState(false);
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('route_settings');
        return saved ? JSON.parse(saved) : {
            algorithm: 'fastest',
            routingProfile: 'car',
            autoDispatch: false,
            liveTracking: true,
            maxStops: 50,
            fuelCost: 1.25,
            serviceTimeMin: 10,
            defaultTimeWindowHours: 4,
            notifications: true,
            darkMode: false,
            officeLat: 13.0827,
            officeLng: 80.2707
        };
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings({
            ...settings,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleSave = () => {
        localStorage.setItem('route_settings', JSON.stringify(settings));
        alert("System Configuration Saved Successfully");
        window.location.reload();
    };

    return (
        <div className="settings-pane" style={{ padding: '0', background: 'transparent' }}>
            <div className="analytics-card" style={{ padding: '24px', border: '2px solid #000', background: '#fff', marginBottom: '24px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800 }}>ROUTING_ENGINE_PARAMETERS</h3>
                    <p style={{ fontSize: '10px', color: '#666' }}>CALIBRATE CORE OPTIMIZER ALGORITHMS</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>OPTIMIZATION_STRATEGY</label>
                        <select name="algorithm" value={settings.algorithm} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}>
                            <option value="fastest">FASTEST_ROUTE (TIME)</option>
                            <option value="shortest">SHORTEST_ROUTE (DISTANCE)</option>
                            <option value="balanced">BALANCED (ECO)</option>
                        </select>
                    </div>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>VEHICLE_PROFILE</label>
                        <select name="routingProfile" value={settings.routingProfile} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}>
                            <option value="car">DELIVERY_VAN</option>
                            <option value="bike">MOTORCYCLE</option>
                            <option value="truck">HEAVY_TRUCK</option>
                        </select>
                    </div>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>MAX_STOPS_LIMIT</label>
                        <input type="number" name="maxStops" value={settings.maxStops} onChange={handleChange} />
                    </div>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>FUEL_COST_COEFF</label>
                        <input type="number" name="fuelCost" value={settings.fuelCost} onChange={handleChange} step="0.01" />
                    </div>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>AVG_SERVICE_TIME (MIN)</label>
                        <input type="number" name="serviceTimeMin" value={settings.serviceTimeMin} onChange={handleChange} />
                    </div>
                </div>
            </div>

            <div className="analytics-card" style={{ padding: '24px', border: '2px solid #000', background: '#fff', marginBottom: '24px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800 }}>GEOSPATIAL_ANCHOR (HQ)</h3>
                    <p style={{ fontSize: '10px', color: '#666' }}>COORDINATE LOCK FOR FLEET DEPARTURE/RETURN</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>LATITUDE_COORD</label>
                        <input type="number" name="officeLat" value={settings.officeLat} onChange={(e) => setSettings({ ...settings, officeLat: parseFloat(e.target.value) })} step="0.0001" />
                    </div>
                    <div className="input-field" style={{ marginBottom: 0 }}>
                        <label>LONGITUDE_COORD</label>
                        <input type="number" name="officeLng" value={settings.officeLng} onChange={(e) => setSettings({ ...settings, officeLng: parseFloat(e.target.value) })} step="0.0001" />
                    </div>
                </div>
            </div>

            <div className="analytics-card" style={{ padding: '24px', border: '2px solid #000', background: '#fff', marginBottom: '24px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800 }}>PLATFORM_OPERATIONS</h3>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #eee' }}>
                    <div>
                        <div style={{ fontSize: '10px', fontWeight: 800 }}>AUTOMATED_DISPATCH</div>
                        <div style={{ fontSize: '9px', color: '#666' }}>SYNC ROUTES TO DRIVER TERMINALS UPON CALCULATION</div>
                    </div>
                    <input type="checkbox" name="autoDispatch" checked={settings.autoDispatch} onChange={handleChange} style={{ width: '20px', height: '20px', accentColor: '#000' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #eee' }}>
                    <div>
                        <div style={{ fontSize: '10px', fontWeight: 800 }}>HI_FREQ_TELEMETRY</div>
                        <div style={{ fontSize: '9px', color: '#666' }}>5S GPS POLLING CYCLE FOR REAL-TIME PRECISION</div>
                    </div>
                    <input type="checkbox" name="liveTracking" checked={settings.liveTracking} onChange={handleChange} style={{ width: '20px', height: '20px', accentColor: '#000' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                    <div>
                        <div style={{ fontSize: '10px', fontWeight: 800 }}>CRITICAL_NOTIFICATIONS</div>
                        <div style={{ fontSize: '9px', color: '#666' }}>ALERTS FOR OFF-ROUTE EVENTS AND DELAYS</div>
                    </div>
                    <input type="checkbox" name="notifications" checked={settings.notifications} onChange={handleChange} style={{ width: '20px', height: '20px', accentColor: '#000' }} />
                </div>
            </div>

            <div className="analytics-card" style={{ padding: '24px', border: '2px solid #000', background: '#fff', marginBottom: '80px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800 }}>DATABASE_SYNCHRONIZATION</h3>
                    <p style={{ fontSize: '10px', color: '#666' }}>POPULATE ENVIRONMENT WITH DEMONSTRATION ASSETS</p>
                </div>
                <button 
                    disabled={isSeeding}
                    onClick={async () => {
                        setIsSeeding(true);
                        try {
                            const demoDrivers = [
                                { id: 'DRV-771', name: 'ARUN K.', capacity: 15, fuelType: 'DIESEL', consumption: 10.5, hourlyWage: 250, status: 'ACTIVE' },
                                { id: 'DRV-882', name: 'VARUN S.', capacity: 12, fuelType: 'ELECTRIC', consumption: 15.2, hourlyWage: 220, status: 'ACTIVE' },
                                { id: 'DRV-993', name: 'MEERA R.', capacity: 20, fuelType: 'CNG', consumption: 12.0, hourlyWage: 280, status: 'ACTIVE' }
                            ];
                            const demoOrders = [
                                { customer: 'RELAY_CORP', address: 'MOUNT ROAD', lat: 13.0645, lng: 80.2456, weight: 2, priority: 'HIGH', status: 'PENDING', timeWindowEnd: 720 },
                                { customer: 'ZENITH_LOGISTICS', address: 'VELACHERY MAIN RD', lat: 12.9815, lng: 80.2185, weight: 3, priority: 'MEDIUM', status: 'PENDING', timeWindowEnd: 900 },
                                { customer: 'ECO_EXPRESS', address: 'OMR ROAD', lat: 12.9228, lng: 80.2312, weight: 1, priority: 'LOW', status: 'PENDING', timeWindowEnd: 1080 },
                                { customer: 'NORTH_CARGO', address: 'ANNA NAGAR', lat: 13.0850, lng: 80.2101, weight: 5, priority: 'HIGH', status: 'PENDING', timeWindowEnd: 600 },
                                { customer: 'SWIFT_DELIVERIES', address: 'T. NAGAR', lat: 13.0418, lng: 80.2341, weight: 2, priority: 'MEDIUM', status: 'PENDING', timeWindowEnd: 1200 }
                            ];
                            await Promise.all([...demoDrivers.map(d => addDriver(d)), ...demoOrders.map(o => addOrder(o))]);
                            alert("FIREBASE_SYNC_COMPLETE");
                        } catch (err) {
                            alert("SYNC_FAILURE: " + err.message);
                        } finally {
                            setIsSeeding(false);
                        }
                    }}
                    className="btn-ghost"
                    style={{ width: '100%', padding: '16px', fontSize: '11px', border: '2px solid #000' }}
                >
                    {isSeeding ? 'SYNCING_METADATA...' : 'SEED_DEMO_DATA_STRUCTURES'}
                </button>
            </div>

            <div style={{ position: 'fixed', bottom: 0, left: '260px', right: 0, background: '#000', color: '#fff', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1000 }}>
                <div style={{ fontSize: '10px', fontWeight: 800 }}>UNSAVED_CONFIGURATION_CHANGES</div>
                <button className="btn-obsidian" onClick={handleSave} style={{ background: '#fff', color: '#000', padding: '12px 32px', fontSize: '11px' }}>
                    APPLY_GLOBAL_CONFIG
                </button>
            </div>
        </div>
    );
};

export default SettingsPane;
