import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { API_ROUTES } from '@app/config';

// Fix for default marker icon in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const OrderForm = ({ onAddOrder, drivers = [], initialDriverId = '' }) => {
    const [formData, setFormData] = useState({
        customer: '',
        address: '',
        priority: 'Medium',
        weight: '',
        width: '',
        height: '',
        breadth: '',
        driverId: '',
        stop_type: 'Residential',
        lat: '',
        lng: '',
    });
    const [scannedLocation, setScannedLocation] = useState(null); // { lat, lng }
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);
    
    // Sync with parent selection
    useEffect(() => {
        setFormData(prev => ({ ...prev, driverId: initialDriverId }));
    }, [initialDriverId]);

    const performGeocoding = async (addressToGeocode) => {
        if (!addressToGeocode) return;
        
        setIsSubmitting(true);
        setError('');

        try {
            let lat = null;
            let lng = null;
            let searchQuery = addressToGeocode;

            // 1. Coordinate Extraction
            const coordRegex = /(-?\d+\.\d+)(?:,|\s+)\s*(-?\d+\.\d+)/;
            const urlCoordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
            const match = addressToGeocode.match(urlCoordRegex) || addressToGeocode.match(coordRegex);

            if (match) {
                lat = parseFloat(match[1]);
                lng = parseFloat(match[2]);
                if (lat > 60 && lat < 95 && lng > 5 && lng < 40) [lat, lng] = [lng, lat];
            } else if (addressToGeocode.includes('google.com/maps') || addressToGeocode.includes('maps.app.goo.gl')) {
                try {
                    const urlObj = new URL(addressToGeocode);
                    const queryParam = urlObj.searchParams.get('q');
                    if (queryParam) {
                        searchQuery = queryParam.replace(/\+/g, ' ');
                    } else {
                        const pathMatch = urlObj.pathname.match(/\/place\/([^\/]+)/);
                        if (pathMatch) searchQuery = decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ');
                    }
                } catch (e) { console.warn("URL parse fail", e); }
            }

            // 2. Backend Geocoding (Prioritizes Nominatim)
            let resolvedAddress = searchQuery;
            if (!lat || !lng) {
                console.log(`[Geocoder] Requesting coordinates for: ${searchQuery}`);
                const url = new URL(API_ROUTES.trafficGeocode, window.location.origin);
                url.searchParams.append('address', searchQuery);
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('backend_jwt_token')}`
                    }
                });
                
                const data = await response.json();
                if (response.ok && data.lat && data.lng) {
                    lat = data.lat;
                    lng = data.lng;
                    resolvedAddress = data.address || searchQuery;
                    console.log(`[Geocoder] Success: ${lat}, ${lng} via ${data.source || 'backend'}`);
                } else {
                    console.warn(`[Geocoder] Failed to resolve: ${searchQuery}`, data);
                    setError(`Could not resolve "${searchQuery}". Please enter manually.`);
                    setIsSubmitting(false);
                    return null;
                }
            }

            // Update form with resolved data
            setFormData(prev => ({ 
                ...prev, 
                address: resolvedAddress,
                lat: lat ? lat.toString() : prev.lat,
                lng: lng ? lng.toString() : prev.lng
            }));
            if (lat && lng) setScannedLocation({ lat, lng });
            return { lat, lng, resolvedAddress };

        } catch (err) {
            console.error("Geocoding failed", err);
            setError("Geocoding service unavailable.");
        } finally {
            setIsSubmitting(false);
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.customer || !formData.address) return;

        // If we don't have lat/lng yet, try to geocode.
        if (!formData.lat || !formData.lng) {
            const result = await performGeocoding(formData.address);
            
            // If automatic geocoding fails, we still show the map picker so the user can pin manually
            if (!result) {
                console.warn("[Geocoder] Resolution failed, showing map for manual pin");
                setScannedLocation({ lat: 13.0827, lng: 80.2707 }); // Default to Chennai center
            }
            
            setShowMapPicker(true);
            return;
        }

        onAddOrder({
            ...formData,
            id: `ORD${Math.floor(Math.random() * 1000)}`,
            status: 'Pending',
            weight: parseFloat(formData.weight) || 0,
            width: parseFloat(formData.width) || 0,
            height: parseFloat(formData.height) || 0,
            breadth: parseFloat(formData.breadth) || 0,
            lat: parseFloat(formData.lat),
            lng: parseFloat(formData.lng)
        });

        setFormData({ 
            customer: '', address: '', priority: 'Medium', weight: '', 
            width: '', height: '', breadth: '', driverId: '', 
            stop_type: 'Residential', lat: '', lng: '' 
        });
        setError('');
    };

    return (
        <form className="order-form" onSubmit={handleSubmit}>
            {error && <p style={{ color: '#d92d20', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
            <div className="form-group">
                <label>Customer Name</label>
                <input
                    type="text"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder="e.g. Acme Corp"
                />
            </div>
            <div className="form-group">
                <label>Delivery Address</label>
                <div className="address-input-wrapper">
                    <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder="Scan or type delivery address..."
                        autoFocus
                    />
                    <button 
                        type="button" 
                        className="scan-icon-btn" 
                        onClick={() => setShowScanner(true)}
                        title="Scan Barcode for Address"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="7" y1="7" x2="17" y2="7" />
                            <line x1="7" y1="12" x2="17" y2="12" />
                            <line x1="7" y1="17" x2="17" y2="17" />
                        </svg>
                    </button>
                </div>
                <small style={{ color: '#667085', fontSize: '0.7rem', marginTop: '0.2rem', display: 'block', opacity: 0.8 }}>
                    Use standard Lat, Lng order (e.g. 13.082, 80.270) for pinpoint accuracy.
                </small>
            </div>

            {/* Barcode Scanner Modal */}
            {showScanner && (
                <BarcodeScannerModal 
                    onScan={async (data) => {
                        let finalAddress = data;
                        let finalCustomer = formData.customer;
                        
                        if (data.includes('|')) {
                            const [name, addr] = data.split('|');
                            finalCustomer = name.trim();
                            finalAddress = addr.trim();
                            setFormData(prev => ({ ...prev, customer: finalCustomer, address: finalAddress }));
                        } else {
                            setFormData(prev => ({ ...prev, address: data }));
                        }
                        
                        setShowScanner(false);
                        // Trigger Geocoding immediately after scan
                        await performGeocoding(finalAddress);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}
            <div className="form-row">
                <div className="form-group">
                    <label>Priority</label>
                    <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Assign to Fleet (Manager)</label>
                    <select
                        value={formData.driverId}
                        onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                    >
                        <option value="">Unassigned (Open Queue)</option>
                        {drivers.map(driver => (
                            <option key={driver.id} value={driver.id}>
                                {driver.name} ({driver.vehicle?.split('(')[0] || 'Fleet Unit'})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Stop Category</label>
                    <select
                        value={formData.stop_type}
                        onChange={(e) => setFormData({ ...formData, stop_type: e.target.value })}
                    >
                        <option value="Residential">Residential Delivery</option>
                        <option value="Business">Business / Commercial</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Latitude</label>
                    <input
                        type="text"
                        value={formData.lat}
                        onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                        placeholder="e.g. 13.0827"
                    />
                </div>
                <div className="form-group">
                    <label>Longitude</label>
                    <input
                        type="text"
                        value={formData.lng}
                        onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                        placeholder="e.g. 80.2707"
                    />
                </div>
                <div className="form-group">
                    <label>Weight (kg)</label>
                    <input
                        type="number"
                        value={formData.weight}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                        placeholder="0"
                    />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Width (cm)</label>
                    <input
                        type="number"
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        placeholder="0"
                    />
                </div>
                <div className="form-group">
                    <label>Height (cm)</label>
                    <input
                        type="number"
                        value={formData.height}
                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                        placeholder="0"
                    />
                </div>
                <div className="form-group">
                    <label>Breadth (cm)</label>
                    <input
                        type="number"
                        value={formData.breadth}
                        onChange={(e) => setFormData({ ...formData, breadth: e.target.value })}
                        placeholder="0"
                    />
                </div>
            </div>
            {showMapPicker && scannedLocation && (
                <div className="map-picker-overlay">
                    <div className="map-picker-content">
                        <div className="picker-header">
                            <h3>Verify Marking Precision</h3>
                            <p>Drag the pin to the exact delivery doorway</p>
                        </div>
                        <div className="picker-map-container">
                            <MapContainer center={[scannedLocation.lat, scannedLocation.lng]} zoom={18} style={{ height: '300px', width: '100%' }}>
                                <ChangeView center={[scannedLocation.lat, scannedLocation.lng]} />
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <DraggableMarker 
                                    position={[scannedLocation.lat, scannedLocation.lng]} 
                                    onMove={(coords) => setScannedLocation(coords)} 
                                />
                            </MapContainer>
                        </div>
                        <div className="picker-footer">
                            <div className="coord-preview">
                                {scannedLocation.lat.toFixed(6)}, {scannedLocation.lng.toFixed(6)}
                            </div>
                            <button type="button" className="confirm-loc-btn" onClick={() => {
                                onAddOrder({
                                    ...formData,
                                    id: `ORD${Math.floor(Math.random() * 1000)}`,
                                    status: 'Pending',
                                    weight: parseFloat(formData.weight) || 0,
                                    width: parseFloat(formData.width) || 0,
                                    height: parseFloat(formData.height) || 0,
                                    breadth: parseFloat(formData.breadth) || 0,
                                    lat: scannedLocation.lat,
                                    lng: scannedLocation.lng
                                });
                                setShowMapPicker(false);
                                setScannedLocation(null);
                                setFormData({ 
                                    customer: '', address: '', priority: 'Medium', weight: '', 
                                    width: '', height: '', breadth: '', driverId: '', 
                                    stop_type: 'Residential', lat: '', lng: '' 
                                });
                            }}>
                                Confirm Point & Register
                            </button>
                            <button type="button" className="cancel-loc-btn" onClick={() => setShowMapPicker(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Locating Point...' : 'Pin on Map'}
            </button>
        </form>
    );
};

// Helper to update map view when center changes
const ChangeView = ({ center }) => {
    const map = useMapEvents({});
    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
};

const DraggableMarker = ({ position, onMove }) => {
    const markerRef = React.useRef(null);
    const eventHandlers = React.useMemo(() => ({
        dragend() {
            const marker = markerRef.current;
            if (marker != null) {
                const newPos = marker.getLatLng();
                onMove({ lat: newPos.lat, lng: newPos.lng });
            }
        },
    }), [onMove]);

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={position}
            ref={markerRef}
        />
    );
};

const BarcodeScannerModal = ({ onScan, onClose }) => {
    useEffect(() => {
        const scanner = new Html5Qrcode("barcode-reader-container");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        scanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                onScan(decodedText);
                scanner.stop();
            },
            (errorMessage) => {
                // Ignore scanning errors as they are frequent while searching
            }
        ).catch(err => {
            console.error("Scanner start error", err);
        });

        return () => {
            if (scanner.isScanning) {
                scanner.stop().catch(e => console.error("Scanner stop cleanup error", e));
            }
        };
    }, []);

    return (
        <div className="scanner-modal-overlay">
            <div className="scanner-modal-content">
                <div className="scanner-header">
                    <h3>Scan Barcode/QR Code</h3>
                    <button className="close-scanner-btn" onClick={onClose}>×</button>
                </div>
                <div id="barcode-reader-container"></div>
                <div className="scanner-info">
                    Align the barcode within the frame to read destination address.
                </div>
            </div>
        </div>
    );
};

export default OrderForm;
