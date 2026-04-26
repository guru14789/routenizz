import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { API_ROUTES } from '../config';

// Fix for default marker icon in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const OrderForm = ({ onAddOrder, drivers = [] }) => {
    const [formData, setFormData] = useState({
        customer: '',
        address: '',
        priority: 'Medium',
        weight: '',
        width: '',
        height: '',
        breadth: '',
        driverId: '',
    });
    const [scannedLocation, setScannedLocation] = useState(null); // { lat, lng }
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.customer || !formData.address) return;

        setIsSubmitting(true);
        setError('');

        try {
            let lat = null;
            let lng = null;
            let searchQuery = formData.address;

            // 1. Improved Coordinate Extraction (supports Lat, Lng with comma or space)
            // Regex handles: "13.08, 80.27", "13.08 80.27", "@13.08,80.27", "(13.08, 80.27)"
            const coordRegex = /(-?\d+\.\d+)(?:,|\s+)\s*(-?\d+\.\d+)/;
            const urlCoordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;

            const match = formData.address.match(urlCoordRegex) || formData.address.match(coordRegex);

            if (match) {
                lat = parseFloat(match[1]);
                lng = parseFloat(match[2]);

                // Safety check: Chennai Lat is ~13, Lng is ~80. If swapped, correct it.
                if (lat > 60 && lat < 95 && lng > 5 && lng < 40) {
                    [lat, lng] = [lng, lat];
                }

                // Strict Geo-Fence Validation against common user typos
                if (lng < 76.0 || lng > 81.0) {
                    setError(`Invalid Coordinates: Longitude ${lng} is outside of Tamil Nadu (points will appear in the sea). Did you mean 80.xx?`);
                    setIsSubmitting(false);
                    return;
                }

            } else if (formData.address.includes('google.com/maps') || formData.address.includes('maps.app.goo.gl')) {
                // If it's a map link without explicit @coords, extract a search query "q=" or fallback to the full path
                try {
                    const urlObj = new URL(formData.address);
                    const queryParam = urlObj.searchParams.get('q');
                    if (queryParam) {
                        searchQuery = queryParam.replace(/\+/g, ' ');
                    } else {
                        // Sometimes the destination is just in the URL path (e.g. /maps/place/Sree+Meditec/...)
                        const pathMatch = urlObj.pathname.match(/\/place\/([^\/]+)/);
                        if (pathMatch) {
                            searchQuery = decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ');
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse Maps URL cleanly", e);
                }
            }

            // 2. Advanced Backend Geocoding (Google Maps Scraper)
            let resolvedAddress = searchQuery;
            if (!lat || !lng) {
                try {
                    const response = await fetch(`${API_ROUTES.trafficGeocode}?address=${encodeURIComponent(searchQuery)}`);
                    const data = await response.json();

                    if (response.ok && data.lat && data.lng) {
                        lat = data.lat;
                        lng = data.lng;
                        resolvedAddress = data.address || searchQuery;
                    } else {
                        // Internal Fallback if scraper fails or address is extremely obscure
                        setError(`Could not resolve "${searchQuery}" precisely. Please try a more specific address or use coordinates.`);
                        setIsSubmitting(false);
                        return;
                    }
                } catch (e) {
                    console.error("Backend geocoding failure", e);
                    setError("Communication error with the Geocoding Engine.");
                    setIsSubmitting(false);
                    return;
                }
            }

            if (lat && lng) {
                setScannedLocation({ lat, lng });
                // Use the officially resolved address from backend if available for better clarity
                setFormData(prev => ({ ...prev, address: resolvedAddress }));
                setShowMapPicker(true);
                setIsSubmitting(false);
                return; // Stop here to let user confirm on map
            }


            onAddOrder({
                ...formData,
                id: `ORD${Math.floor(Math.random() * 1000)}`,
                status: 'Pending',
                weight: parseFloat(formData.weight) || 0,
                width: parseFloat(formData.width) || 0,
                height: parseFloat(formData.height) || 0,
                breadth: parseFloat(formData.breadth) || 0,
                lat: lat,
                lng: lng
            });

            setFormData({ customer: '', address: '', priority: 'Medium', weight: '', width: '', height: '', breadth: '', driverId: '' });
            setError(''); // Clear any previous errors

        } catch (err) {
            console.error("Failed to geocode address", err);
            setError("Network error while validating address.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form className="order-form" onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Add Order</h3>
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
                    onScan={(data) => {
                        // Support for composite barcodes (e.g. "Acme Corp|123 Main St, Chennai")
                        if (data.includes('|')) {
                            const [name, addr] = data.split('|');
                            setFormData({ ...formData, customer: name.trim(), address: addr.trim() });
                        } else {
                            setFormData({ ...formData, address: data });
                        }
                        setShowScanner(false);
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
                                setFormData({ customer: '', address: '', priority: 'Medium', weight: '', width: '', height: '', breadth: '', driverId: '' });
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
