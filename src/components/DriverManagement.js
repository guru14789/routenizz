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
        // Filter orders specific to this driver
        const driverOrders = orders.filter(o => o.driverId === selectedDriver.id);

        // Calculate the optimized route uniquely for this driver's orders
        const pendingDriverOrders = driverOrders.filter(o => o.status === 'Pending');

        // NOTE: optimizeRoute is async. Per-driver route is computed in the Dashboard
        // via the onRecalculate prop which feeds back through the global route state.
        const driverOptimizedOrders = route.filter(o => o.driverId === selectedDriver.id);

        return (
            <div className="driver-management-container" style={{ paddingBottom: '2rem' }}>
                <div className="dm-header" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <button
                        className="back-btn"
                        onClick={() => navigate('/admin/drivers')}
                        style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid #d0d5dd', background: '#fff', cursor: 'pointer', fontWeight: '500' }}
                    >
                        ← Back to Fleet
                    </button>
                    <div className="driver-info-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="driver-avatar" style={{ width: '40px', height: '40px' }}>{selectedDriver.avatar}</div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedDriver.name}'s Route</h2>
                            <p style={{ margin: 0, color: '#667085', fontSize: '0.85rem' }}>Managing active assignments for {selectedDriver.id} ({selectedDriver.vehicle})</p>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <Dashboard
                        orders={driverOrders}
                        route={driverOptimizedOrders}
                        setRoute={setRoute}
                        isCalculating={false} // Prevent global re-calc loop in individual view
                        onAddOrder={(newOrder) => onAddOrder({ ...newOrder, driverId: selectedDriver.id })}
                        onDeleteOrder={onDeleteOrder}
                        onRecalculate={onRecalculate}
                        onToggleRole={onToggleRole}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="driver-management-container">
            <div className="dm-header">
                <div className="dm-title-section">
                    <h2>Driver Fleet</h2>
                    <p>Manage and track your active delivery personnel</p>
                </div>
                <div className="dm-actions">
                    <div className="search-bar">
                        <span className="search-icon"><DriverManagementIcons.Search /></span>
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="add-driver-btn" onClick={() => setIsAddModalOpen(true)}>+ Add New Driver</button>
                </div>
            </div>

            <div className="drivers-grid">
                {filteredDrivers.map(driver => (
                    <div className="driver-card" key={driver.id} style={{ borderTop: `4px solid ${getFleetColor(driver.id)}` }}>
                        <div className="driver-card-header">
                            <div className="driver-avatar" style={{ backgroundColor: getFleetColor(driver.id), color: '#fff' }}>{driver.avatar}</div>
                            <div className="driver-info">
                                <h3>{driver.name}</h3>
                                <span className="driver-id">{driver.id}</span>
                            </div>
                            <div className={`status-badge ${getStatusClass(driver.status)}`}>
                                <span className="status-dot"></span>
                                {driver.status}
                            </div>
                        </div>

                        <div className="driver-stats">
                            <div className="d-stat">
                                <span className="d-label">Vehicle</span>
                                <span className="d-value">{driver.vehicle}</span>
                            </div>
                            <div className="d-stat">
                                <span className="d-label">Rating</span>
                                <span className="d-value"><DriverManagementIcons.Star /> {driver.rating}</span>
                            </div>
                            <div className="d-stat">
                                <span className="d-label">Completed</span>
                                <span className="d-value">{driver.completedToday}</span>
                            </div>
                        </div>

                        <div className="driver-actions">
                             <button
                                className="contact-btn"
                                style={{ padding: '0.4rem 0.6rem' }}
                                onClick={() => handleOpenModal(driver)}
                            >
                                Edit
                            </button>
                            <button
                                className="contact-btn"
                                onClick={() => window.location.href = `tel:${driver.phone}`}
                            >
                                <DriverManagementIcons.Phone /> Contact
                            </button>
                            <button
                                className="assign-btn"
                                onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                            >
                                <DriverManagementIcons.Map /> Manage Route
                            </button>
                            {onDeleteDriver && (
                                <button
                                    className="contact-btn"
                                    style={{ padding: '0.4rem 0.6rem', color: '#d92d20', borderColor: '#fda29b' }}
                                    onClick={() => {
                                        if (window.confirm(`Remove ${driver.name} from the fleet? This cannot be undone.`)) {
                                            onDeleteDriver(driver.id);
                                        }
                                    }}
                                    title="Remove driver"
                                >
                                    ✕ Remove
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {filteredDrivers.length === 0 && (
                    <div className="no-drivers-found">
                        <p>No drivers found matching "{searchTerm}"</p>
                    </div>
                )}
            </div>

            {/* Driver Modal (Add/Edit) */}
            {isAddModalOpen && (
                <div className="dm-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
                    <div className="dm-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="dm-modal-header">
                            <h3>{editingDriver ? "Edit Driver Details" : "Onboard New Driver"}</h3>
                            <button className="close-modal" onClick={() => setIsAddModalOpen(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="dm-modal-form">
                            <div className="form-grid">
                                <div className="form-group full-width">
                                    <label>Full Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe"
                                        required
                                        value={driverFormData.name}
                                        onChange={e => setDriverFormData({ ...driverFormData, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Vehicle Type</label>
                                    <select
                                        value={driverFormData.vehicleType}
                                        onChange={e => setDriverFormData({ ...driverFormData, vehicleType: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="bike">Bike</option>
                                        <option value="scooty">Scooty</option>
                                        <option value="van">Van</option>
                                        <option value="truck">Truck</option>
                                        <option value="lorry">Lorry</option>
                                        <option value="bus">Bus</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Vehicle Number</label>
                                    <input
                                        type="text"
                                        placeholder="TN 01 AB 1234"
                                        required
                                        value={driverFormData.vehicleNumber}
                                        onChange={e => setDriverFormData({ ...driverFormData, vehicleNumber: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Fuel Type</label>
                                    <select
                                        value={driverFormData.fuelType}
                                        onChange={e => setDriverFormData({ ...driverFormData, fuelType: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="Diesel">Diesel</option>
                                        <option value="Petrol">Petrol</option>
                                        <option value="Electric">Electric</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Consumption (L/100km)</label>
                                    <input
                                        type="number"
                                        placeholder="12.0"
                                        step="0.1"
                                        value={driverFormData.consumption}
                                        onChange={e => setDriverFormData({ ...driverFormData, consumption: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Hourly Wage (₹)</label>
                                    <input
                                        type="number"
                                        placeholder="250.0"
                                        step="10"
                                        value={driverFormData.hourlyWage}
                                        onChange={e => setDriverFormData({ ...driverFormData, hourlyWage: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Idle Cost/hr (₹)</label>
                                    <input
                                        type="number"
                                        placeholder="50.0"
                                        step="5"
                                        value={driverFormData.idleCost}
                                        onChange={e => setDriverFormData({ ...driverFormData, idleCost: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>License Number</label>
                                    <input
                                        type="text"
                                        placeholder="TN 01 20240001234"
                                        value={driverFormData.licenseNo}
                                        onChange={e => setDriverFormData({ ...driverFormData, licenseNo: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Employee Number</label>
                                    <input
                                        type="text"
                                        placeholder="EMP-10234"
                                        value={driverFormData.employeeNo}
                                        onChange={e => setDriverFormData({ ...driverFormData, employeeNo: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Phone Number</label>
                                    <input
                                        type="tel"
                                        placeholder="+91 98765 43210"
                                        value={driverFormData.phone}
                                        onChange={e => setDriverFormData({ ...driverFormData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Max Load (kg)</label>
                                    <input
                                        type="number"
                                        placeholder="500"
                                        value={driverFormData.maxLoad}
                                        onChange={e => setDriverFormData({ ...driverFormData, maxLoad: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="container-dimensions">
                                <label>Container Size (W x B x H)</label>
                                <div className="dimension-inputs">
                                    <input
                                        type="number"
                                        placeholder="Width"
                                        value={driverFormData.width}
                                        onChange={e => setDriverFormData({ ...driverFormData, width: e.target.value })}
                                    />
                                    <span>&times;</span>
                                    <input
                                        type="number"
                                        placeholder="Breadth"
                                        value={driverFormData.breadth}
                                        onChange={e => setDriverFormData({ ...driverFormData, breadth: e.target.value })}
                                    />
                                    <span>&times;</span>
                                    <input
                                        type="number"
                                        placeholder="Height"
                                        value={driverFormData.height}
                                        onChange={e => setDriverFormData({ ...driverFormData, height: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="button" className="cancel-btn" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                                <button type="submit" className="submit-btn" disabled={!driverFormData.name || !driverFormData.vehicleNumber}>
                                    {editingDriver ? "Update Driver" : "Register Driver"}
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
