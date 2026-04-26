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
        <form className="order-form" onSubmit={handleSubmit} style={{ background: '#fff', border: 'none', padding: '0', boxShadow: 'none' }}>
            {error && <p style={{ color: '#ff0000', fontSize: '10px', fontWeight: 800, marginBottom: '16px', background: '#000', color: '#fff', padding: '8px' }}>[ERROR] {error}</p>}
            
            <div className="input-field">
                <label>CUSTOMER_IDENTIFIER</label>
                <input
                    type="text"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder="E.G. ACME_CORP"
                />
            </div>

            <div className="input-field">
                <label>DELIVERY_ADDRESS / COORDINATES</label>
                <div style={{ position: 'relative' }}>
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
                        placeholder="SCAN_OR_TYPE_ADDRESS..."
                    />
                    <button 
                        type="button" 
                        onClick={() => setShowScanner(true)}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: '#000', border: 'none', color: '#fff', padding: '4px', cursor: 'pointer', display: 'flex' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="17" x2="17" y2="17"/></svg>
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>PRIORITY</label>
                    <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}
                    >
                        <option value="High">HIGH</option>
                        <option value="Medium">MEDIUM</option>
                        <option value="Low">LOW</option>
                    </select>
                </div>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>FLEET_UNIT</label>
                    <select
                        value={formData.driverId}
                        onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                        style={{ width: '100%', padding: '12px', border: '1px solid #000', borderRadius: 0, appearance: 'none', background: '#fff' }}
                    >
                        <option value="">OPEN_QUEUE</option>
                        {drivers.map(driver => (
                            <option key={driver.id} value={driver.id}>
                                {driver.name.toUpperCase()}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>WT_KG</label>
                    <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="0" />
                </div>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>W_CM</label>
                    <input type="number" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="0" />
                </div>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>H_CM</label>
                    <input type="number" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} placeholder="0" />
                </div>
                <div className="input-field" style={{ marginBottom: 0 }}>
                    <label>B_CM</label>
                    <input type="number" value={formData.breadth} onChange={(e) => setFormData({ ...formData, breadth: e.target.value })} placeholder="0" />
                </div>
            </div>

            {showMapPicker && scannedLocation && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ background: '#fff', border: '2px solid #000', width: '100%', maxWidth: '600px', padding: '24px' }}>
                        <div style={{ marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>VERIFY_MARKING_PRECISION</h3>
                            <p style={{ fontSize: '10px', color: '#666' }}>CALIBRATE DROP-OFF POINT ON GEOGRAPHIC GRID</p>
                        </div>
                        
                        <div style={{ height: '300px', background: '#eee', border: '2px solid #000', marginBottom: '24px' }}>
                            <MapContainer center={[scannedLocation.lat, scannedLocation.lng]} zoom={18} style={{ height: '100%', width: '100%' }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <DraggableMarker 
                                    position={[scannedLocation.lat, scannedLocation.lng]} 
                                    onMove={(coords) => setScannedLocation(coords)} 
                                />
                            </MapContainer>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', fontWeight: 800 }}>
                                LAT: {scannedLocation.lat.toFixed(6)} | LNG: {scannedLocation.lng.toFixed(6)}
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" className="btn-ghost" style={{ padding: '12px 24px', fontSize: '11px', border: '2px solid #000' }} onClick={() => setShowMapPicker(false)}>CANCEL</button>
                                <button type="button" className="btn-obsidian" style={{ padding: '12px 24px', fontSize: '11px' }} onClick={() => {
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
                                }}>CONFIRM_POINT</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Barcode Scanner Modal Redesign */}
            {showScanner && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ background: '#fff', border: '2px solid #000', width: '100%', maxWidth: '400px', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>SCAN_MANIFEST</h3>
                            <button onClick={() => setShowScanner(false)} style={{ background: 'none', border: 'none', fontSize: '24px', fontWeight: 800, cursor: 'pointer' }}>×</button>
                        </div>
                        <div id="barcode-reader-container" style={{ border: '2px solid #000', background: '#000', marginBottom: '16px' }}></div>
                        <p style={{ fontSize: '10px', color: '#666', textAlign: 'center' }}>ALIGN BARCODE WITHIN FRAME FOR OPTICAL RECOGNITION</p>
                    </div>
                </div>
            )}
        </form>
    );
};
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
