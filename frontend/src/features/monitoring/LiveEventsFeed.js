/**
 * ORION-ELITE: Live Re-Optimization Feed
 * PHASE 3 — Real-time event stream component.
 * Subscribes to Redis route_updated channel via SSE and shows live events.
 */
import React, { useState, useEffect, useRef } from 'react';
import './LiveEventsFeed.css';

const EVENT_TYPES = {
  traffic_update:   { icon: '🚦', color: '#f59e0b', label: 'TRAFFIC' },
  new_order:        { icon: '📦', color: '#6366f1', label: 'ORDER' },
  driver_delay:     { icon: '⏱', color: '#ef4444', label: 'DELAY' },
  manual:           { icon: '🛠', color: '#10b981', label: 'MANUAL' },
  route_updated:    { icon: '🔄', color: '#06b6d4', label: 'ROUTE UPDATE' },
  intent_learned:   { icon: '🧠', color: '#8b5cf6', label: 'AI LEARNING' },
  simulation:       { icon: '⚡', color: '#ec4899', label: 'SIMULATION' },
  default:          { icon: '📡', color: '#94a3b8', label: 'SYSTEM' },
};

const EventItem = ({ event, isNew }) => {
  const meta = EVENT_TYPES[event.type] || EVENT_TYPES.default;

  return (
    <div className={`event-item ${isNew ? 'event-new' : ''}`}>
      <div className="event-icon" style={{ background: `${meta.color}18`, color: meta.color }}>
        {meta.icon}
      </div>
      <div className="event-body">
        <div className="event-top">
          <span className="event-type" style={{ color: meta.color }}>{meta.label}</span>
          <span className="event-time">{event.time}</span>
        </div>
        <p className="event-msg">{event.message}</p>
        {event.detail && <p className="event-detail">{event.detail}</p>}
      </div>
      {event.impact && (
        <div className={`event-impact ${event.impact.positive ? 'positive' : 'negative'}`}>
          {event.impact.label}
        </div>
      )}
    </div>
  );
};

const LiveEventsFeed = ({ apiBase }) => {
  const [events, setEvents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, reroutes: 0, saved_min: 0 });
  const feedRef = useRef(null);
  const esRef = useRef(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  // Subscribe to Server-Sent Events for real-time updates
  useEffect(() => {
    const url = `${apiBase || 'http://localhost:8001'}/api/v1/tasks/live-events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      addEvent({ type: 'default', message: 'Live event stream active.', detail: url });
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const evtType = data.type || 'default';
        addEvent({
          type: evtType,
          message: data.message || `Event: ${evtType}`,
          detail: data.detail,
          impact: data.impact,
        });

        if (evtType === 'route_updated') {
          setStats(prev => ({
            total: prev.total + 1,
            reroutes: prev.reroutes + 1,
            saved_min: prev.saved_min + (data.time_saved_min || 0),
          }));
        }
      } catch {
        // Non-JSON heartbeat — ignore
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      // Graceful reconnect handled by browser EventSource
    };

    return () => es.close();
  }, [apiBase]);

  const addEvent = (evt) => {
    setEvents(prev => [
      ...prev.slice(-49),  // keep last 50
      {
        ...evt,
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString([], { hour12: false }),
        isNew: true,
      }
    ]);
    // Remove "new" flag after animation
    setTimeout(() => {
      setEvents(prev => prev.map(e => ({ ...e, isNew: false })));
    }, 1000);
  };

  useEffect(() => {
    // Demo mode removed to prevent mock data from confusing users
  }, [isConnected]);

  return (
    <div className="live-feed">
      {/* Header */}
      <div className="feed-topbar">
        <div className="feed-title-row">
          <span className="feed-dot" style={{ background: isConnected ? '#4ade80' : '#f87171' }} />
          <span className="feed-title">Live Re-Opt Feed</span>
          <span className="feed-status">{isConnected ? 'SSE CONNECTED' : 'DEMO MODE'}</span>
        </div>
        <div className="feed-kpis">
          <div className="feed-kpi">
            <span className="kpi-val">{stats.reroutes}</span>
            <span className="kpi-label">Re-Opts</span>
          </div>
          <div className="feed-kpi">
            <span className="kpi-val">{stats.saved_min.toFixed(0)}m</span>
            <span className="kpi-label">Saved</span>
          </div>
        </div>
      </div>

      {/* Events stream */}
      <div className="feed-scroll" ref={feedRef}>
        {events.map(evt => (
          <EventItem key={evt.id} event={evt} isNew={evt.isNew} />
        ))}
      </div>
    </div>
  );
};

export default LiveEventsFeed;
