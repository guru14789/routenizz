/**
 * USES: Live System Health Monitor — "Orion Superiority" Feature.
 * SUPPORT: Polls the backend /health endpoint every 30 seconds and renders
 *          a real-time, color-coded dependency status panel for the admin.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config.js';
import './SystemHealth.css';

const HEALTH_URL = `${API_BASE}/health`;
const POLL_INTERVAL_MS = 30_000;

const icons = {
    ml:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    osrm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>,
    redis:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
    db:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
};

const statusColor = {
    ok:       { dot: '#22c55e', text: '#22c55e', label: 'OK' },
    degraded: { dot: '#f59e0b', text: '#f59e0b', label: 'DEGRADED' },
    unknown:  { dot: '#6b7280', text: '#6b7280', label: '...' },
    error:    { dot: '#ef4444', text: '#ef4444', label: 'ERROR' },
};

const depKey = {
    ml_model:    { label: 'ML Model',    icon: icons.ml,    ok: 'loaded',     bad: 'critical_failure' },
    osrm_router: { label: 'OSRM Router', icon: icons.osrm,  ok: 'reachable',  bad: 'unreachable' },
    redis_cache: { label: 'Redis Cache', icon: icons.redis,  ok: 'connected',  bad: 'unreachable' },
    database:    { label: 'Database',    icon: icons.db,     ok: 'connected',  bad: 'disconnected' },
};

export default function SystemHealth() {
    const [health, setHealth]       = useState(null);
    const [lastPoll, setLastPoll]   = useState(null);
    const [polling, setPolling]     = useState(false);

    const poll = useCallback(async () => {
        setPolling(true);
        try {
            const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
            const data = await r.json();
            setHealth(data);
        } catch {
            setHealth(prev => prev ? { ...prev, status: 'degraded' } : null);
        } finally {
            setPolling(false);
            setLastPoll(new Date());
        }
    }, []);

    useEffect(() => {
        poll();
        const id = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [poll]);

    const overall = health?.status ?? 'unknown';
    const overallStyle = overall === 'ok' ? statusColor.ok : overall === 'degraded' ? statusColor.degraded : statusColor.unknown;
    const deps = health?.dependencies ?? {};

    return (
        <div className="sys-health-widget">
            <div className="sh-header">
                <div className="sh-title-row">
                    <span className="sh-label">System Health</span>
                    <span className="sh-badge" style={{ background: overallStyle.dot + '22', color: overallStyle.dot, border: `1px solid ${overallStyle.dot}44` }}>
                        <span className="sh-dot" style={{ background: overallStyle.dot }} />
                        {overallStyle.label}
                    </span>
                </div>
                <button className="sh-refresh" onClick={poll} disabled={polling} title="Refresh now">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: polling ? 'sh-spin 0.8s linear infinite' : 'none' }}>
                        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-3.36"/>
                    </svg>
                </button>
            </div>

            <div className="sh-deps">
                {Object.entries(depKey).map(([key, meta]) => {
                    const rawVal = deps[key];
                    const isOk = rawVal === meta.ok;
                    const isBad = rawVal === meta.bad;
                    const s = !rawVal ? statusColor.unknown : isOk ? statusColor.ok : isBad ? statusColor.error : statusColor.degraded;
                    return (
                        <div className="sh-dep-row" key={key}>
                            <span className="sh-dep-icon" style={{ color: s.dot }}>{meta.icon}</span>
                            <span className="sh-dep-name">{meta.label}</span>
                            <span className="sh-dep-val" style={{ color: s.text }}>{rawVal ?? '—'}</span>
                        </div>
                    );
                })}
            </div>

            {lastPoll && (
                <div className="sh-footer">
                    Last checked: {lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    {health?.version && <span className="sh-ver"> · v{health.version}</span>}
                </div>
            )}
        </div>
    );
}
