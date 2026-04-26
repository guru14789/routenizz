/**
 * USES: Fleet and personnel management interface.
 * SUPPORT: Allows admins to add, update, and remove drivers and vehicles, as well as assign specific route orders to vehicle capacities.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './DriverManagement.css';
import Dashboard from './Dashboard';
import { getFleetColor } from '../utils/colors';

// mockDrivers removed - using externalDrivers from props

const DriverManagementIcons = {
    Search: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
    Star: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    ),
    Phone: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-2.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
    ),
    Map: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
    )
};

const DriverManagement = ({ orders, route, setRoute, optimizedOrders, onAddOrder, onDeleteOrder, externalDrivers = [], onAddDriver, onUpdateDriver, onDeleteDriver, onRecalculate, onToggleRole, selectedDriverId }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const fleet = externalDrivers.length > 0 ? externalDrivers : [];
    
    // Sync selected driver with URL param
    const selectedDriver = selectedDriverId ? fleet.find(d => d.id === selectedDriverId) : null;

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState(null); // Added editingDriver state
    const [driverFormData, setDriverFormData] = useState({
        name: '',
        vehicleType: 'van',
        vehicleNumber: '',
        fuelType: 'Diesel',
        consumption: 12.0,
        hourlyWage: 250.0,
        idleCost: 50.0,
        phone: '',
        licenseNo: '',
        employeeNo: '',
        maxLoad: '',
        width: '',
        breadth: '',
        height: ''
    });

    const filteredDrivers = fleet.filter(driver =>
        driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenModal = (driver = null) => {
        if (driver) {
            setEditingDriver(driver);
            setDriverFormData({
                name: driver.name,
                vehicleType: driver.vehicleType || 'van',
                vehicleNumber: (driver.vehicle || '').match(/\(([^)]+)\)/)?.[1] || driver.vehicleNumber || '',
                fuelType: driver.fuelType || 'Diesel',
                consumption: driver.consumption || 12.0,
                hourlyWage: driver.hourlyWage || 250.0,
                idleCost: driver.idleCost || 50.0,
                phone: driver.phone || '',
                licenseNo: driver.licenseNo || '',
                employeeNo: driver.employeeNo || '',
                maxLoad: driver.maxLoad || '',
                width: driver.width || '',
                breadth: driver.breadth || '',
                height: driver.height || ''
            });
        } else {
            setEditingDriver(null);
            setDriverFormData({
                name: '',
                vehicleType: 'van',
                vehicleNumber: '',
                fuelType: 'Diesel',
                consumption: 12.0,
                hourlyWage: 250.0,
                idleCost: 50.0,
                phone: '',
                licenseNo: '',
                employeeNo: '',
                maxLoad: '',
                width: '',
                breadth: '',
                height: ''
            });
        }
        setIsAddModalOpen(true);
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!driverFormData.name || !driverFormData.vehicleNumber) return;

        const vehicle = `${driverFormData.vehicleType.toUpperCase()} (${driverFormData.vehicleNumber})`;
        const avatar = driverFormData.name.split(' ').map(n => n[0]).join('').toUpperCase();

        if (editingDriver) {
            // Handle update logic using onUpdateDriver
            if (onUpdateDriver) {
                onUpdateDriver(editingDriver.id, {
                    ...driverFormData,
                    vehicle,
                    avatar,
                });
            }
        } else {
            // Handle add logic
            const id = `DRV-${String(fleet.length + 1).padStart(3, '0')}-${Date.now().toString(36).slice(-4)}`;
            const driverToAdd = {
                ...driverFormData,
                id,
                avatar,
                vehicle,
                status: 'Idle',
                rating: 5.0,
                completedToday: 0
            };

            if (onAddDriver) {
                onAddDriver(driverToAdd);
            }
        }
        setIsAddModalOpen(false);
        setEditingDriver(null);
        setDriverFormData({
            name: '',
            vehicleType: 'van',
            vehicleNumber: '',
            fuelType: 'Diesel',
            consumption: 12.0,
            phone: '',
            licenseNo: '',
            employeeNo: '',
            maxLoad: '',
            width: '',
            breadth: '',
            height: ''
        });
    };

    const getStatusClass = (status) => {
        switch (status) {
            case 'On Route': return 'status-active';
            case 'Idle': return 'status-idle';
            default: return 'status-offline';
        }
    };

    if (selectedDriver) {
        const driverOrders = orders.filter(o => o.driverId === selectedDriver.id);
        const driverOptimizedOrders = route.filter(o => o.driverId === selectedDriver.id);

        return (
            <div className="driver-management-container" style={{ paddingBottom: '2rem' }}>
                <div className="dm-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '24px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                    <button
                        onClick={() => navigate('/admin/drivers')}
                        className="btn-ghost"
                        style={{ padding: '8px 16px', fontSize: '10px' }}
                    >
                        ← BACK_TO_FLEET
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px' }}>
                            {selectedDriver.avatar}
                        </div>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' }}>MANIFEST: {selectedDriver.name}</h2>
                            <p style={{ fontSize: '9px', color: '#666', fontWeight: 700 }}>UNIT_ID: {selectedDriver.id} // {selectedDriver.vehicle.toUpperCase()}</p>
                        </div>
                    </div>
                </div>

                <Dashboard
                    orders={driverOrders}
                    route={driverOptimizedOrders}
                    setRoute={setRoute}
                    isCalculating={false}
                    onAddOrder={(newOrder) => onAddOrder({ ...newOrder, driverId: selectedDriver.id })}
                    onDeleteOrder={onDeleteOrder}
                    onRecalculate={onRecalculate}
                    onToggleRole={onToggleRole}
                />
            </div>
        );
    }

    return (
        <div className="driver-management-container">
            <div className="dm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '32px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800 }}>FLEET_OPERATIONS</h2>
                    <p style={{ fontSize: '10px', color: '#666' }}>ACTIVE_UNITS: {filteredDrivers.length} / v2.1-OBSIDIAN</p>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <div className="search-bar" style={{ borderRadius: 0, border: '2px solid #000', width: '300px' }}>
                        <span className="search-icon"><DriverManagementIcons.Search /></span>
                        <input
                            type="text"
                            placeholder="SEARCH_BY_ID_OR_NAME..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 }}
                        />
                    </div>
                    <button className="btn-obsidian" onClick={() => handleOpenModal()} style={{ padding: '0 24px', fontSize: '11px' }}>
                        + ONBOARD_NEW_UNIT
                    </button>
                </div>
            </div>

            <div className="drivers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                {filteredDrivers.map(driver => (
                    <div className="analytics-card" key={driver.id} style={{ padding: '24px', border: '2px solid #000', background: '#fff', borderTop: '6px solid #000' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <div style={{ width: '48px', height: '48px', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900 }}>
                                    {driver.avatar}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>{driver.name}</h3>
                                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#666' }}>{driver.id}</span>
                                </div>
                            </div>
                            <span style={{ 
                                background: driver.status === 'On Route' ? '#000' : '#fff', 
                                color: driver.status === 'On Route' ? '#fff' : '#000', 
                                border: '1px solid #000',
                                padding: '2px 8px',
                                fontSize: '9px',
                                fontWeight: 900
                            }}>
                                [{driver.status.toUpperCase()}]
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ border: '1px solid #eee', padding: '8px' }}>
                                <div style={{ fontSize: '8px', color: '#666', fontWeight: 800 }}>VEHICLE_UNIT</div>
                                <div style={{ fontSize: '10px', fontWeight: 800 }}>{driver.vehicle.toUpperCase()}</div>
                            </div>
                            <div style={{ border: '1px solid #eee', padding: '8px' }}>
                                <div style={{ fontSize: '8px', color: '#666', fontWeight: 800 }}>PERFORMANCE_SCORE</div>
                                <div style={{ fontSize: '10px', fontWeight: 800 }}>{driver.rating} / 5.0</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button className="btn-obsidian" onClick={() => navigate(`/admin/drivers/${driver.id}`)} style={{ flex: 1, fontSize: '10px', padding: '10px' }}>
                                MANAGE_ROUTE
                            </button>
                            <button className="btn-ghost" onClick={() => handleOpenModal(driver)} style={{ padding: '10px', fontSize: '10px' }}>
                                EDIT
                            </button>
                            <button className="btn-ghost" onClick={() => window.location.href = `tel:${driver.phone}`} style={{ padding: '10px', fontSize: '10px' }}>
                                CONTACT
                            </button>
                            <button 
                                className="btn-ghost" 
                                style={{ padding: '10px', fontSize: '10px', color: '#f00' }}
                                onClick={() => {
                                    if (window.confirm(`TERMINATE_UNIT: ${driver.id}?`)) {
                                        onDeleteDriver(driver.id);
                                    }
                                }}
                            >
                                DELETE
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isAddModalOpen && (
                <div className="modal-overlay" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="analytics-card" style={{ width: '600px', padding: '32px', border: '3px solid #000', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>{editingDriver ? "UPDATE_UNIT_CONFIG" : "REGISTER_NEW_UNIT"}</h3>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
                        </div>
                        
                        <form onSubmit={handleFormSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                <div className="input-field" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                                    <label>FULL_NAME</label>
                                    <input type="text" required value={driverFormData.name} onChange={e => setDriverFormData({ ...driverFormData, name: e.target.value })} />
                                </div>
                                <div className="input-field" style={{ marginBottom: 0 }}>
                                    <label>VEHICLE_TYPE</label>
                                    <select value={driverFormData.vehicleType} onChange={e => setDriverFormData({ ...driverFormData, vehicleType: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}>
                                        <option value="van">VAN</option>
                                        <option value="bike">BIKE</option>
                                        <option value="truck">TRUCK</option>
                                        <option value="scooty">SCOOTY</option>
                                    </select>
                                </div>
                                <div className="input-field" style={{ marginBottom: 0 }}>
                                    <label>UNIT_REG_NUMBER</label>
                                    <input type="text" required value={driverFormData.vehicleNumber} onChange={e => setDriverFormData({ ...driverFormData, vehicleNumber: e.target.value })} />
                                </div>
                                <div className="input-field" style={{ marginBottom: 0 }}>
                                    <label>FUEL_TYPE</label>
                                    <select value={driverFormData.fuelType} onChange={e => setDriverFormData({ ...driverFormData, fuelType: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}>
                                        <option value="Diesel">DIESEL</option>
                                        <option value="Petrol">PETROL</option>
                                        <option value="Electric">ELECTRIC</option>
                                    </select>
                                </div>
                                <div className="input-field" style={{ marginBottom: 0 }}>
                                    <label>CONSUMPTION (L/100KM)</label>
                                    <input type="number" step="0.1" value={driverFormData.consumption} onChange={e => setDriverFormData({ ...driverFormData, consumption: parseFloat(e.target.value) || 0 })} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <button type="button" className="btn-ghost" onClick={() => setIsAddModalOpen(false)} style={{ flex: 1, padding: '16px' }}>CANCEL</button>
                                <button type="submit" className="btn-obsidian" style={{ flex: 2, padding: '16px' }}>
                                    {editingDriver ? "COMMIT_CHANGES" : "FINALIZE_REGISTRATION"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverManagement;
