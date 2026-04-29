/**
 * ORION-ELITE: Pre-Route Planning Panel
 * Admin workflow: ingest orders → configure constraints → generate + review routes → dispatch
 */
import React, { useState, useEffect, useCallback } from 'react';
import './PreRoutePlanner.css';

const PRIORITY_LABELS = { 10: '🔴 Critical', 8: '🟠 High', 5: '🟡 Medium', 3: '🟢 Low', 1: '⚪ Minimal' };

const Icons = {
  Optimize: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Dispatch: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Package: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  Edit: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Vehicle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
};

const PreRoutePlanner = ({ drivers = [], orders = [], vehicles = [], apiBase = 'http://localhost:8001', onRoutesGenerated }) => {
  const [editedOrders, setEditedOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [routes, setRoutes] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // orders | rules | result
  const [optimScore, setOptimScore] = useState(null);
  const [rules, setRules] = useState({
    avoidLeftTurns: false,
    prioritizeHighPriority: true,
    maxStopsPerVehicle: 20,
    shiftEndBuffer: 30,
    evFirst: false,
    balanceLoad: true,
  });
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const pending = orders.filter(o => o.status === 'pending' || o.status === 'assigned');
    setEditedOrders(pending);
    setSelectedOrders(new Set(pending.map(o => o.id)));
  }, [orders]);

  const showNotice = (msg, type = 'info') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 4000);
  };

  const toggleSelect = (id) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (order) => {
    setEditingId(order.id);
    setEditBuffer({ priority: order.priority, time_window_end: order.time_window_end });
  };

  const saveEdit = (id) => {
    setEditedOrders(prev => prev.map(o =>
      o.id === id ? { ...o, priority: parseInt(editBuffer.priority), time_window_end: parseInt(editBuffer.time_window_end) } : o
    ));
    setEditingId(null);
  };

  const handleOptimize = async () => {
    const selectedStops = editedOrders.filter(o => selectedOrders.has(o.id));
    if (selectedStops.length === 0) { showNotice('Select at least one order to optimize.', 'warn'); return; }
    if (vehicles.length === 0 && drivers.length === 0) { showNotice('No vehicles available for dispatch.', 'warn'); return; }

    setIsOptimizing(true);
    setActiveTab('result');

    const vehiclePayload = vehicles.length > 0
      ? vehicles.map((v, i) => ({ vehicle_id: v.vehicle_id || v.external_id || `V-${i}`, capacity: v.capacity || 50, weight_capacity_kg: v.weight_capacity_kg || 1000, volume_capacity_m3: v.volume_capacity_m3 || 10, is_electric: v.is_electric || false, consumption_liters_per_100km: v.consumption_liters_per_100km || 12, fuel_price_per_litre: 95, cost_per_km: 1.5, driver_hourly_wage: 250, shift_end: 64800 }))
      : drivers.map((d, i) => ({ vehicle_id: d.id || `V-${i}`, capacity: 50, weight_capacity_kg: 1000, volume_capacity_m3: 10, is_electric: false, consumption_liters_per_100km: 12, fuel_price_per_litre: 95, cost_per_km: 1.5, driver_hourly_wage: 250, shift_end: 64800 }));

    const stopsPayload = selectedStops.map(o => ({
      id: String(o.id), name: o.customer_name, lat: o.destination_lat, lng: o.destination_lng,
      priority: o.priority, demand_units: o.demand_units || 1, weight_kg: o.weight_kg || 0,
      volume_m3: o.volume_m3 || 0, time_window_end: o.time_window_end || 86400, stop_type: o.stop_type || 'Residential',
    }));

    try {
      const res = await fetch(`${apiBase}/api/v1/logistics/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ office: { lat: 13.0827, lng: 80.2707 }, vehicles: vehiclePayload, stops: stopsPayload }),
      });
      const data = await res.json();
      if (data.routes) {
        setRoutes(data.routes);
        setOptimScore(data.optimization_score);
        showNotice(`✅ Optimized ${data.routes.length} routes. Score: ${data.optimization_score?.toFixed(1)}`, 'success');
        if (onRoutesGenerated) onRoutesGenerated(data);
      } else {
        showNotice('Optimization returned no routes.', 'warn');
      }
    } catch (e) {
      showNotice(`Optimization failed: ${e.message}`, 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCalibrate = async () => {
    if (!routes) return;
    setIsDispatching(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/dispatch`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          office: { lat: 13.0827, lng: 80.2707 },
          business_rules: rules,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotice(`🛠 Calibration Complete! Routes staged and assigned.`, 'success');
        setRoutes(prev => prev.map(r => ({ ...r, status: 'assigned' })));
      }
    } catch (e) {
      showNotice(`Calibration failed: ${e.message}`, 'error');
    } finally {
      setIsDispatching(false);
    }
  };

  const handlePublish = async () => {
    setIsDispatching(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/publish-route`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          office: { lat: 13.0827, lng: 80.2707 },
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotice(`🚀 Published! ${data.published_count} orders are now live for drivers.`, 'success');
        setRoutes(null); // Clear after publish
        setActiveTab('orders');
      }
    } catch (e) {
      showNotice(`Publish failed: ${e.message}`, 'error');
    } finally {
      setIsDispatching(false);
    }
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('backend_jwt_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const secToTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div className="prp-container">
      {/* ── Header ── */}
      <div className="prp-header">
        <div className="prp-title-block">
          <h2 className="prp-title">Pre-Route Planning</h2>
          <span className="prp-subtitle">{editedOrders.length} orders · {selectedOrders.size} selected · {vehicles.length || drivers.length} vehicles</span>
        </div>
        <div className="prp-header-actions">
          {optimScore && <div className="score-badge">ORION Score: {optimScore.toFixed(1)}</div>}
          <button className="prp-btn-secondary" onClick={() => setActiveTab(activeTab === 'rules' ? 'orders' : 'rules')}>
            ⚙ Rules
          </button>
          <button className="prp-btn-primary" onClick={handleOptimize} disabled={isOptimizing}>
            <Icons.Optimize /> {isOptimizing ? 'Calibrating...' : 'Generate Routes'}
          </button>
          {routes && (
            <button className="prp-btn-dispatch" onClick={handleCalibrate} disabled={isDispatching}>
              <Icons.Dispatch /> {isDispatching ? 'Staging...' : 'Calibrate Routes'}
            </button>
          )}
          {routes && routes.some(r => r.status === 'assigned') && (
            <button className="prp-btn-publish" onClick={handlePublish} disabled={isDispatching}>
              <Icons.Check /> {isDispatching ? 'Publishing...' : 'Publish to Fleet'}
            </button>
          )}
        </div>
      </div>

      {/* ── Notice ── */}
      {notice && <div className={`prp-notice ${notice.type}`}>{notice.msg}</div>}

      {/* ── Tabs ── */}
      <div className="prp-tabs">
        {['orders', 'rules', 'result'].map(t => (
          <button key={t} className={`prp-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'orders' ? '📦 Order Queue' : t === 'rules' ? '⚙️ Business Rules' : '🗺 Route Result'}
            {t === 'result' && routes && <span className="tab-badge">{routes.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Order Queue ── */}
      {activeTab === 'orders' && (
        <div className="prp-order-list">
          <div className="prp-list-header">
            <label className="prp-select-all">
              <input type="checkbox" checked={selectedOrders.size === editedOrders.length}
                onChange={e => setSelectedOrders(e.target.checked ? new Set(editedOrders.map(o => o.id)) : new Set())} />
              Select All
            </label>
            <span className="prp-sort-hint">Sorted by priority ↓</span>
          </div>
          {[...editedOrders].sort((a, b) => b.priority - a.priority).map(order => (
            <div key={order.id} className={`prp-order-card ${selectedOrders.has(order.id) ? 'selected' : ''}`}>
              <input type="checkbox" className="prp-order-check" checked={selectedOrders.has(order.id)} onChange={() => toggleSelect(order.id)} />
              <div className="prp-order-meta">
                <div className="prp-order-name">
                  <Icons.Package /> {order.customer_name}
                  <span className="prp-stop-type">{order.stop_type}</span>
                </div>
                <div className="prp-order-details">
                  <span>{order.destination_lat?.toFixed(4)}, {order.destination_lng?.toFixed(4)}</span>
                  <span>·</span>
                  <span>{order.weight_kg || 0}kg</span>
                  <span>·</span>
                  <span>{order.volume_m3 || 0}m³</span>
                </div>
              </div>
              <div className="prp-order-controls">
                {editingId === order.id ? (
                  <div className="prp-inline-edit">
                    <select value={editBuffer.priority} onChange={e => setEditBuffer(p => ({ ...p, priority: e.target.value }))}>
                      {[10, 8, 5, 3, 1].map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                    </select>
                    <input type="number" value={Math.floor(editBuffer.time_window_end / 3600)}
                      onChange={e => setEditBuffer(p => ({ ...p, time_window_end: e.target.value * 3600 }))}
                      placeholder="End Hour" min="8" max="22" />
                    <button className="prp-save-btn" onClick={() => saveEdit(order.id)}><Icons.Check /></button>
                  </div>
                ) : (
                  <>
                    <span className={`prp-priority-badge p${order.priority}`}>{PRIORITY_LABELS[order.priority] || `P${order.priority}`}</span>
                    <span className="prp-window">⏱ by {secToTime(order.time_window_end)}</span>
                    <button className="prp-edit-btn" onClick={() => startEdit(order)}><Icons.Edit /></button>
                  </>
                )}
              </div>
            </div>
          ))}
          {editedOrders.length === 0 && (
            <div className="prp-empty">No pending orders. Add orders via the Queue tab.</div>
          )}
        </div>
      )}

      {/* ── Business Rules ── */}
      {activeTab === 'rules' && (
        <div className="prp-rules-panel">
          <div className="prp-rules-grid">
            {[
              { key: 'prioritizeHighPriority', label: 'Prioritize Critical Deliveries', desc: 'Critical orders are never dropped' },
              { key: 'avoidLeftTurns', label: 'Avoid Left Turns', desc: 'India-optimized: reduce idling at intersections' },
              { key: 'balanceLoad', label: 'Balance Fleet Load', desc: 'Distribute stops evenly across drivers' },
              { key: 'evFirst', label: 'EV-First Routing', desc: 'Prefer electric vehicles for inner-city stops' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="prp-rule-card" onClick={() => setRules(r => ({ ...r, [key]: !r[key] }))}>
                <div className={`prp-rule-toggle ${rules[key] ? 'on' : 'off'}`}>
                  <div className="prp-rule-thumb" />
                </div>
                <div className="prp-rule-text">
                  <div className="prp-rule-label">{label}</div>
                  <div className="prp-rule-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="prp-rules-sliders">
            <div className="prp-slider-row">
              <label>Max Stops Per Vehicle: <strong>{rules.maxStopsPerVehicle}</strong></label>
              <input type="range" min="5" max="50" value={rules.maxStopsPerVehicle}
                onChange={e => setRules(r => ({ ...r, maxStopsPerVehicle: parseInt(e.target.value) }))} />
            </div>
            <div className="prp-slider-row">
              <label>Shift-End Buffer: <strong>{rules.shiftEndBuffer} min</strong></label>
              <input type="range" min="0" max="120" step="15" value={rules.shiftEndBuffer}
                onChange={e => setRules(r => ({ ...r, shiftEndBuffer: parseInt(e.target.value) }))} />
            </div>
          </div>
        </div>
      )}

      {/* ── Route Result ── */}
      {activeTab === 'result' && (
        <div className="prp-result-panel">
          {isOptimizing && (
            <div className="prp-optimizing">
              <div className="prp-spinner" />
              <span>ORION-ELITE solver running...</span>
            </div>
          )}
          {!isOptimizing && !routes && (
            <div className="prp-empty">Click "Generate Routes" to see the optimized plan.</div>
          )}
          {routes && routes.map((route, i) => (
            <div key={route.vehicle_id} className="prp-route-card">
              <div className="prp-route-header">
                <span className="prp-vehicle-badge"><Icons.Vehicle /> {route.vehicle_id}</span>
                <div className="prp-route-kpis">
                  <span>{route.stops?.filter(s => !String(s.id).startsWith('HQ')).length} stops</span>
                  <span>{route.distance_km?.toFixed(1)} km</span>
                  <span>{route.duration_min?.toFixed(0)} min</span>
                  <span className="prp-cost">₹{route.total_cost?.toFixed(0)}</span>
                </div>
              </div>
              <div className="prp-stop-sequence">
                {route.stops?.filter(s => !String(s.id).startsWith('HQ')).map((stop, si) => (
                  <div key={stop.id} className="prp-seq-stop">
                    <span className="prp-seq-num">{si + 1}</span>
                    <span className="prp-seq-name">{stop.name || stop.customer_name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PreRoutePlanner;
