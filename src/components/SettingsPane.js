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
        <div className="settings-pane">
            <div className="settings-section">
                <div className="section-header">
                    <h3>Routing Engine Configuration</h3>
                    <p>Adjust the parameters used by the core optimizer algorithm.</p>
                </div>
                <div className="settings-grid">
                    <div className="setting-item">
                        <label>Optimization Strategy</label>
                        <select name="algorithm" value={settings.algorithm} onChange={handleChange}>
                            <option value="fastest">Fastest Route (Time-Optimized)</option>
                            <option value="shortest">Shortest Route (Distance-Optimized)</option>
                            <option value="balanced">Balanced (Eco-Friendly)</option>
                        </select>
                    </div>
                    <div className="setting-item">
                        <label>Vehicle Profile</label>
                        <select name="routingProfile" value={settings.routingProfile} onChange={handleChange}>
                            <option value="car">Standard Delivery Van</option>
                            <option value="bike">Motorcycle / Scooter</option>
                            <option value="truck">Heavy Truck</option>
                        </select>
                    </div>
                    <div className="setting-item">
                        <label>Max Stops Per Route</label>
                        <input
                            type="number"
                            name="maxStops"
                            value={settings.maxStops}
                            onChange={handleChange}
                            min="1"
                            max="200"
                        />
                    </div>
                    <div className="setting-item">
                        <label>Fuel Cost Multiplier (per km)</label>
                        <input
                            type="number"
                            name="fuelCost"
                            value={settings.fuelCost}
                            onChange={handleChange}
                            step="0.01"
                        />
                    </div>
                    <div className="setting-item">
                        <label>Avg. Service Time (Min)</label>
                        <input
                            type="number"
                            name="serviceTimeMin"
                            value={settings.serviceTimeMin}
                            onChange={handleChange}
                            min="1"
                            max="60"
                        />
                    </div>
                    <div className="setting-item">
                        <label>Default Time Window (Hours)</label>
                        <input
                            type="number"
                            name="defaultTimeWindowHours"
                            value={settings.defaultTimeWindowHours}
                            onChange={handleChange}
                            min="1"
                            max="24"
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="section-header">
                    <h3>Headquarters Location</h3>
                    <p>Set the default office coordinates for first and last route points.</p>
                </div>
                <div className="settings-grid">
                    <div className="setting-item">
                        <label>Office Latitude</label>
                        <input
                            type="number"
                            name="officeLat"
                            value={settings.officeLat}
                            onChange={(e) => setSettings({ ...settings, officeLat: parseFloat(e.target.value) })}
                            step="0.0001"
                        />
                    </div>
                    <div className="setting-item">
                        <label>Office Longitude</label>
                        <input
                            type="number"
                            name="officeLng"
                            value={settings.officeLng}
                            onChange={(e) => setSettings({ ...settings, officeLng: parseFloat(e.target.value) })}
                            step="0.0001"
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="section-header">
                    <h3>Platform Operations</h3>
                    <p>Control fleet tracking and automated dispatch behaviors.</p>
                </div>

                <div className="toggle-item">
                    <div className="toggle-info">
                        <span>Automated Dispatch</span>
                        <p>Automatically push optimized routes to driver devices.</p>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            name="autoDispatch"
                            checked={settings.autoDispatch}
                            onChange={handleChange}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="toggle-item" style={{ borderTop: '1px solid #f5f5f5' }}>
                    <div className="toggle-info">
                        <span>High-Frequency Telemetry</span>
                        <p>Receive GPS updates from drivers every 5 seconds instead of 30.</p>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            name="liveTracking"
                            checked={settings.liveTracking}
                            onChange={handleChange}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="toggle-item" style={{ borderTop: '1px solid #f5f5f5' }}>
                    <div className="toggle-info">
                        <span>Critical Alerts</span>
                        <p>Receive system notifications for off-route behavior and delays.</p>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            name="notifications"
                            checked={settings.notifications}
                            onChange={handleChange}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
            </div>

            <div className="settings-section" style={{ borderTop: '2px dashed #e2e8f0', paddingTop: '2rem', marginTop: '2rem' }}>
                <div className="section-header">
                    <h3>Database Synchronization</h3>
                    <p>Populate your fresh Firebase environment with demonstration assets.</p>
                </div>
                <div className="seed-action-box" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
                        This will add 3 drivers and 5 orders to your active Firebase project to demonstrate the VRP engine and live telemetry features.
                    </div>
                    <button 
                        className="seed-btn" 
                        disabled={isSeeding}
                        onClick={async () => {
                            setIsSeeding(true);
                            try {
                                const demoDrivers = [
                                    { id: 'DRV-771', name: 'Arun K.', capacity: 15, fuelType: 'Diesel', consumption: 10.5, hourlyWage: 250, status: 'Active' },
                                    { id: 'DRV-882', name: 'Varun S.', capacity: 12, fuelType: 'Electric', consumption: 15.2, hourlyWage: 220, status: 'Active' },
                                    { id: 'DRV-993', name: 'Meera R.', capacity: 20, fuelType: 'CNG', consumption: 12.0, hourlyWage: 280, status: 'Active' }
                                ];
                                
                                const demoOrders = [
                                    { customer: 'Relay Corp', address: 'Mount Road', lat: 13.0645, lng: 80.2456, weight: 2, priority: 'High', status: 'Pending', timeWindowEnd: 720 },
                                    { customer: 'Zenith Logistics', address: 'Velachery Main Rd', lat: 12.9815, lng: 80.2185, weight: 3, priority: 'Medium', status: 'Pending', timeWindowEnd: 900 },
                                    { customer: 'EcoExpress', address: 'OMR Road', lat: 12.9228, lng: 80.2312, weight: 1, priority: 'Low', status: 'Pending', timeWindowEnd: 1080 },
                                    { customer: 'North Cargo', address: 'Anna Nagar', lat: 13.0850, lng: 80.2101, weight: 5, priority: 'High', status: 'Pending', timeWindowEnd: 600 },
                                    { customer: 'Swift Deliveries', address: 'T. Nagar', lat: 13.0418, lng: 80.2341, weight: 2, priority: 'Medium', status: 'Pending', timeWindowEnd: 1200 }
                                ];

                                await Promise.all([
                                    ...demoDrivers.map(d => addDriver(d)),
                                    ...demoOrders.map(o => addOrder(o))
                                ]);
                                
                                alert("Firebase Synchronization Complete! Fleet and Queue populated.");
                            } catch (err) {
                                console.error(err);
                                alert("Sync failed: " + err.message);
                            } finally {
                                setIsSeeding(false);
                            }
                        }}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: isSeeding ? '#94a3b8' : '#0f172a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        {isSeeding ? 'SYNCING...' : 'SEED DEMO DATA'}
                    </button>
                </div>
            </div>

            <div className="save-settings-bar">
                <p>Unsaved changes to algorithmic parameters</p>
                <button className="save-btn" onClick={handleSave}>
                    APPLY CONFIGURATION
                </button>
            </div>
        </div>
    );
};

export default SettingsPane;
