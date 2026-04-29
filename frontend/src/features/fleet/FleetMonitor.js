/**
 * ORION-ELITE: Fleet Monitor — Admin Live Operations Dashboard
 * Shows real-time fleet status, exceptions, and per-vehicle intervention controls.
 */
import React, { useState, useEffect, useCallback } from 'react';
import './FleetMonitor.css';

const SEVERITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

const Icons = {
  Truck: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  Alert: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Reroute: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  Reassign: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Emergency: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
};

const FleetMonitor = ({ apiBase = 'http://localhost:8001', routes = [], orders = [], drivers = [] }) => {
  const [fleetData, setFleetData] = useState({ fleet: [], kpis: {}, updated_at: null });
  const [exceptions, setExceptions] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [intervention, setIntervention] = useState({ action: 'reroute', reason: '', targetDriver: '' });
  const [isIntervening, setIsIntervening] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const showNotice = (msg, type = 'info') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 4000);
  };

  const fetchFleetStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fleetRes, excRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/admin/fleet-status`),
        fetch(`${apiBase}/api/v1/admin/exceptions`),
      ]);
      if (fleetRes.ok) {
        const fd = await fleetRes.json();
        setFleetData(fd);
      }
      if (excRes.ok) {
        const ed = await excRes.json();
        setExceptions(ed.exceptions || []);
      }
    } catch (e) {
      // Fallback: derive from local routes/orders props
      const derived = deriveFromProps();
      setFleetData(derived);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase]);

  // Derive fleet state from locally available props (fallback when backend is unavailable)
  const deriveFromProps = () => {
    const fleet = routes.map(route => {
      const stops = route.stops?.filter(s => !String(s.id).startsWith('HQ')) || [];
      const completed = stops.filter(s => s.status === 'Completed' || s.status === 'completed').length;
      const failed = stops.filter(s => s.status === 'failed' || s.status === 'Failed').length;
      const total = stops.length;
      return {
        vehicle_id: route.vehicle_id,
        vehicle_type: 'Van',
        is_electric: false,
        total_stops: total,
        completed,
        failed,
        in_transit: 0,
        pending: total - completed - failed,
        progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        has_exception: failed > 0,
        distance_km: route.distance_km || 0,
        total_cost: route.total_cost || 0,
        next_stop: stops.find(s => s.status === 'Pending' || s.status === 'assigned'),
      };
    });

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'Completed').length;
    const failedOrders = orders.filter(o => o.status === 'failed').length;

    return {
      fleet,
      kpis: {
        active_vehicles: fleet.filter(v => v.pending > 0).length,
        total_orders: totalOrders,
        completed: completedOrders,
        failed: failedOrders,
        on_time_rate: totalOrders > 0 ? Math.round(completedOrders / totalOrders * 100) : 100,
        exceptions: fleet.filter(v => v.has_exception).length,
      },
      updated_at: new Date().toISOString(),
    };
  };

  useEffect(() => {
    fetchFleetStatus();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchFleetStatus, 15000); // Every 15 seconds
    }
    return () => clearInterval(interval);
  }, [fetchFleetStatus, autoRefresh]);

  // Also derive from props when routes/orders change
  useEffect(() => {
    if (routes.length > 0 && fleetData.fleet.length === 0) {
      setFleetData(deriveFromProps());
    }
  }, [routes, orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIntervene = async () => {
    if (!selectedVehicle) return;
    setIsIntervening(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: selectedVehicle,
          action: intervention.action,
          reason: intervention.reason,
          payload: intervention.action === 'reassign' ? { target_driver_id: intervention.targetDriver } : {},
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotice(`✅ ${intervention.action} dispatched to ${selectedVehicle}`, 'success');
        setSelectedVehicle(null);
        fetchFleetStatus();
      } else {
        showNotice(`Intervention failed: ${data.detail}`, 'error');
      }
    } catch (e) {
      showNotice(`Cannot reach backend: ${e.message}`, 'error');
    } finally {
      setIsIntervening(false);
    }
  };

  const handleEmergencyReopt = async () => {
    try {
      await fetch(`${apiBase}/api/v1/admin/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: 'ALL', action: 'emergency', reason: 'Admin triggered emergency re-optimization', payload: {} }),
      });
      showNotice('🚨 Emergency re-optimization triggered for all vehicles.', 'warn');
    } catch (e) {
      showNotice(`Emergency re-opt failed: ${e.message}`, 'error');
    }
  };

  const { fleet, kpis } = fleetData;

  return (
    <div className="fm-container">
      {/* ── Top KPI Bar ── */}
      <div className="fm-kpi-bar">
        {[
          { label: 'Active Vehicles', value: kpis.active_vehicles ?? fleet.length, color: '#818cf8' },
          { label: 'Total Orders', value: kpis.total_orders ?? orders.length, color: '#94a3b8' },
          { label: 'Delivered', value: kpis.completed ?? 0, color: '#10b981' },
          { label: 'Failed', value: kpis.failed ?? 0, color: '#ef4444' },
          { label: 'On-Time Rate', value: `${kpis.on_time_rate ?? 100}%`, color: '#f59e0b' },
          { label: 'Exceptions', value: kpis.exceptions ?? exceptions.length, color: exceptions.length > 0 ? '#ef4444' : '#10b981' },
        ].map(kpi => (
          <div key={kpi.label} className="fm-kpi-card">
            <div className="fm-kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="fm-kpi-label">{kpi.label}</div>
          </div>
        ))}
        <div className="fm-kpi-actions">
          <button className={`fm-refresh-btn ${isLoading ? 'spinning' : ''}`} onClick={fetchFleetStatus} title="Refresh">
            <Icons.Refresh />
          </button>
          <button className={`fm-auto-btn ${autoRefresh ? 'on' : 'off'}`} onClick={() => setAutoRefresh(v => !v)}>
            {autoRefresh ? 'Auto ●' : 'Auto ○'}
          </button>
          <button className="fm-emergency-btn" onClick={handleEmergencyReopt}>
            <Icons.Emergency /> Re-Opt All
          </button>
        </div>
      </div>

      {notice && <div className={`fm-notice ${notice.type}`}>{notice.msg}</div>}

      <div className="fm-body">
        {/* ── Vehicle Cards Column ── */}
        <div className="fm-vehicles-col">
          <div className="fm-col-header">Fleet Status</div>
          {fleet.length === 0 && !isLoading && (
            <div className="fm-empty">No active vehicles found. Register drivers to see fleet status.</div>
          )}
          {fleet.map(v => (
            <div
              key={v.vehicle_id}
              className={`fm-vehicle-card ${v.has_exception ? 'exception' : ''} ${selectedVehicle === v.vehicle_id ? 'selected' : ''}`}
              onClick={() => setSelectedVehicle(selectedVehicle === v.vehicle_id ? null : v.vehicle_id)}
            >
              <div className="fm-vc-header">
                <div className="fm-vc-id">
                  <Icons.Truck />
                  <span>{v.vehicle_id}</span>
                  {v.is_electric && <span className="fm-ev-badge">EV</span>}
                </div>
                <div className="fm-vc-progress-pct" style={{ color: v.progress_pct >= 80 ? '#10b981' : v.progress_pct >= 50 ? '#f59e0b' : '#94a3b8' }}>
                  {v.progress_pct}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="fm-progress-track">
                <div className="fm-progress-fill" style={{ width: `${v.progress_pct}%`, background: v.progress_pct >= 80 ? '#10b981' : '#6366f1' }} />
              </div>

              {/* Stop counts */}
              <div className="fm-vc-stats">
                <span className="fm-stat done">✓ {v.completed}</span>
                <span className="fm-stat pending">● {v.pending}</span>
                {v.failed > 0 && <span className="fm-stat failed">✗ {v.failed}</span>}
                <span className="fm-stat dist">{(v.distance_km || 0).toFixed(1)} km</span>
                <span className="fm-stat cost">₹{(v.total_cost || 0).toFixed(0)}</span>
              </div>

              {/* Next Stop */}
              {v.next_stop && (
                <div className="fm-next-stop">
                  → {v.next_stop.name || v.next_stop.customer_name}
                </div>
              )}

              {/* Exception Flag */}
              {v.has_exception && (
                <div className="fm-exception-badge">
                  <Icons.Alert /> {v.failed} failure{v.failed !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Exceptions + Intervention Column ── */}
        <div className="fm-right-col">
          {/* Exceptions */}
          <div className="fm-section">
            <div className="fm-col-header">Active Exceptions <span className="fm-exc-count">{exceptions.length}</span></div>
            {exceptions.length === 0 && <div className="fm-empty">No exceptions. All routes operating normally.</div>}
            {exceptions.map(exc => (
              <div key={exc.id} className="fm-exc-card" onClick={() => setSelectedVehicle(exc.vehicle_id)}>
                <div className="fm-exc-dot" style={{ background: SEVERITY_COLOR[exc.severity] }} />
                <div className="fm-exc-body">
                  <div className="fm-exc-msg">{exc.message}</div>
                  <div className="fm-exc-meta">
                    {exc.vehicle_id} · {exc.action?.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="fm-exc-type">{exc.type?.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>

          {/* Intervention Panel */}
          {selectedVehicle && (
            <div className="fm-intervention-panel">
              <div className="fm-int-header">
                Intervention: <strong>{selectedVehicle}</strong>
                <button className="fm-int-close" onClick={() => setSelectedVehicle(null)}>✕</button>
              </div>

              <div className="fm-int-actions">
                {[
                  { action: 'reroute', icon: <Icons.Reroute />, label: 'Reroute', desc: 'Push new stop sequence' },
                  { action: 'reassign', icon: <Icons.Reassign />, label: 'Reassign', desc: 'Move stops to another driver' },
                  { action: 'pause', icon: '⏸', label: 'Pause', desc: 'Halt route progression' },
                  { action: 'emergency', icon: <Icons.Emergency />, label: 'Emergency', desc: 'Full fleet re-opt' },
                ].map(opt => (
                  <button
                    key={opt.action}
                    className={`fm-int-action-btn ${intervention.action === opt.action ? 'active' : ''}`}
                    onClick={() => setIntervention(i => ({ ...i, action: opt.action }))}
                  >
                    <span className="fm-int-icon">{opt.icon}</span>
                    <span className="fm-int-label">{opt.label}</span>
                  </button>
                ))}
              </div>

              {intervention.action === 'reassign' && (
                <div className="fm-int-field">
                  <label>Target Driver</label>
                  <select value={intervention.targetDriver} onChange={e => setIntervention(i => ({ ...i, targetDriver: e.target.value }))}>
                    <option value="">-- Select Driver --</option>
                    {fleet.filter(v => v.vehicle_id !== selectedVehicle).map(v => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_id}</option>
                    ))}
                    {drivers.filter(d => d.id !== selectedVehicle).map(d => (
                      <option key={d.id} value={d.id}>{d.name || d.id}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="fm-int-field">
                <label>Reason / Notes</label>
                <textarea
                  placeholder="e.g., Driver delayed by 25 minutes due to accident on NH-48"
                  value={intervention.reason}
                  onChange={e => setIntervention(i => ({ ...i, reason: e.target.value }))}
                  rows={2}
                />
              </div>

              <button className="fm-dispatch-btn" onClick={handleIntervene} disabled={isIntervening}>
                {isIntervening ? 'Dispatching...' : `Dispatch ${intervention.action}`}
              </button>
            </div>
          )}

          {/* Post-Route Analytics Teaser */}
          <div className="fm-section fm-post-route">
            <div className="fm-col-header">Today's Performance</div>
            <div className="fm-perf-grid">
              <div className="fm-perf-metric">
                <div className="fm-perf-val">{kpis.on_time_rate ?? 100}%</div>
                <div className="fm-perf-label">On-Time Rate</div>
              </div>
              <div className="fm-perf-metric">
                <div className="fm-perf-val">{fleet.reduce((s, v) => s + (v.distance_km || 0), 0).toFixed(0)} km</div>
                <div className="fm-perf-label">Total Distance</div>
              </div>
              <div className="fm-perf-metric">
                <div className="fm-perf-val">₹{fleet.reduce((s, v) => s + (v.total_cost || 0), 0).toFixed(0)}</div>
                <div className="fm-perf-label">Fleet Cost</div>
              </div>
              <div className="fm-perf-metric">
                <div className="fm-perf-val">{fleet.filter(v => v.is_electric).length}</div>
                <div className="fm-perf-label">EV Vehicles</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FleetMonitor;
