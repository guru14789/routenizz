/**
 * ORION-ELITE: What-If Simulation Panel
 * PHASE 3 — Frontend component for running and visualizing scenario comparisons.
 * Dispatchers can test demand spikes, vehicle breakdowns, and traffic disruptions
 * before committing to real-world changes.
 */
import React, { useState } from 'react';
import './SimulationPanel.css';

const Icons = {
  Package: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Wrench: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  TrafficLight: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="20" rx="4" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
    </svg>
  ),
  Siren: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 20a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5" />
      <path d="M12 15a8 8 0 0 0-8-8v0a8 8 0 0 1 16 0v0a8 8 0 0 0-8 8" />
      <path d="M12 2v3" />
      <path d="M22 15h-2" />
      <path d="M4 15H2" />
      <path d="M19.07 7.93l1.41-1.41" />
      <path d="M3.52 6.52l1.41 1.41" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Play: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Loader: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin-svg">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
};

const SCENARIOS = [
  {
    id: 'demand_spike',
    icon: <Icons.Package />,
    label: 'Demand Spike',
    description: 'Inject extra orders mid-route',
    color: '#f59e0b',
  },
  {
    id: 'vehicle_breakdown',
    icon: <Icons.Wrench />,
    label: 'Vehicle Breakdown',
    description: 'Remove vehicles from active fleet',
    color: '#ef4444',
  },
  {
    id: 'traffic_disruption',
    icon: <Icons.TrafficLight />,
    label: 'Traffic Disruption',
    description: 'Simulate major road slowdown',
    color: '#8b5cf6',
  },
  {
    id: 'emergency',
    icon: <Icons.Siren />,
    label: 'Emergency Mode',
    description: 'Override all priorities to maximum',
    color: '#dc2626',
  },
];

const MetricDelta = ({ label, baseline, simulated, unit = '', invert = false }) => {
  const delta = simulated - baseline;
  const isImprovement = invert ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.01;

  return (
    <div className="metric-delta">
      <span className="metric-label">{label}</span>
      <div className="metric-values">
        <span className="metric-baseline">{baseline.toFixed(1)}{unit}</span>
        <span className={`metric-arrow ${isNeutral ? 'neutral' : isImprovement ? 'good' : 'bad'}`}>
          {isNeutral ? '→' : delta > 0 ? '↑' : '↓'}
        </span>
        <span className={`metric-sim ${isNeutral ? '' : isImprovement ? 'good' : 'bad'}`}>
          {simulated.toFixed(1)}{unit}
        </span>
        <span className={`metric-pct ${isNeutral ? 'neutral' : isImprovement ? 'good' : 'bad'}`}>
          ({delta > 0 ? '+' : ''}{delta.toFixed(1)}{unit})
        </span>
      </div>
    </div>
  );
};

const SimulationPanel = ({ office, vehicles, stops, apiBase }) => {
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [trafficMultiplier, setTrafficMultiplier] = useState(1.5);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runSimulation = async () => {
    if (!selectedScenario) return;
    setIsRunning(true);
    setError(null);
    setResult(null);

    const payload = {
      office: office || { lat: 13.0827, lng: 80.2707 },
      vehicles: vehicles || [],
      stops: stops || [],
      scenario_type: selectedScenario,
      traffic_multiplier: trafficMultiplier,
    };

    // For demand_spike: add 3 synthetic stops near Chennai
    if (selectedScenario === 'demand_spike') {
      payload.extra_stops = [
        { id: 'SIM-001', name: 'Sim Stop A', lat: 13.09, lng: 80.27, demand_units: 2, priority: 7 },
        { id: 'SIM-002', name: 'Sim Stop B', lat: 13.06, lng: 80.25, demand_units: 1, priority: 5 },
        { id: 'SIM-003', name: 'Sim Stop C', lat: 13.11, lng: 80.29, demand_units: 3, priority: 8 },
      ];
    }

    // For vehicle_breakdown: remove first vehicle
    if (selectedScenario === 'vehicle_breakdown') {
      const firstVehicle = vehicles?.[0]?.vehicle_id || 'V-001';
      payload.remove_vehicle_ids = [String(firstVehicle)];
    }

    try {
      const res = await fetch(`${apiBase || 'http://localhost:8001'}/api/v1/simulation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Simulation failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const scenarioColor = SCENARIOS.find(s => s.id === selectedScenario)?.color || '#6366f1';

  return (
    <div className="sim-panel">
      <div className="sim-header">
        <div className="sim-title-block">
          <span className="sim-badge">ORION-ELITE</span>
          <h2 className="sim-title">What-If Simulation Engine</h2>
          <p className="sim-subtitle">
            Test scenarios before committing to the live fleet. Zero risk, full insight.
          </p>
        </div>
      </div>

      {/* Scenario Cards */}
      <div className="scenario-grid">
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            className={`scenario-card ${selectedScenario === s.id ? 'selected' : ''}`}
            style={{ '--card-color': s.color }}
            onClick={() => setSelectedScenario(s.id)}
          >
            <span className="scenario-icon">{s.icon}</span>
            <span className="scenario-label">{s.label}</span>
            <span className="scenario-desc">{s.description}</span>
          </button>
        ))}
      </div>

      {/* Traffic multiplier control */}
      {selectedScenario === 'traffic_disruption' && (
        <div className="traffic-control">
          <label className="ctrl-label">Traffic Slowdown: {Math.round((trafficMultiplier - 1) * 100)}%</label>
          <input
            type="range"
            min="1.1"
            max="3.0"
            step="0.1"
            value={trafficMultiplier}
            onChange={e => setTrafficMultiplier(parseFloat(e.target.value))}
            className="ctrl-slider"
            style={{ accentColor: scenarioColor }}
          />
          <div className="ctrl-labels">
            <span>+10%</span>
            <span>+200%</span>
          </div>
        </div>
      )}

      {/* Run button */}
      <button
        className={`sim-run-btn ${isRunning ? 'running' : ''} ${!selectedScenario ? 'disabled' : ''}`}
        onClick={runSimulation}
        disabled={isRunning || !selectedScenario}
        style={{ '--btn-color': scenarioColor }}
      >
        {isRunning ? (
          <>
            <span className="spin-icon"><Icons.Loader /></span>
            Running Simulation...
          </>
        ) : (
          <>
            <span className="play-icon"><Icons.Play /></span>
            Run {SCENARIOS.find(s => s.id === selectedScenario)?.label || 'Scenario'}
          </>
        )}
      </button>

      {/* Error state */}
      {error && (
        <div className="sim-error">
          <span className="error-icon"><Icons.AlertTriangle /></span>
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="sim-results">
          <div className="results-header">
            <span className="results-badge">SIMULATION COMPLETE</span>
            <span className="results-scenario">{result.scenario}</span>
          </div>

          {/* Metric Comparison */}
          <div className="metrics-grid">
            <MetricDelta
              label="Total Cost (₹)"
              baseline={result.comparison.baseline.cost}
              simulated={result.comparison.simulated.cost}
              unit=""
              invert={false}
            />
            <MetricDelta
              label="Duration (min)"
              baseline={result.comparison.baseline.duration_min}
              simulated={result.comparison.simulated.duration_min}
              unit="m"
              invert={false}
            />
            <MetricDelta
              label="CO₂ Emitted (kg)"
              baseline={result.comparison.baseline.co2_kg}
              simulated={result.comparison.simulated.co2_kg}
              unit="kg"
              invert={false}
            />
          </div>

          {/* Delta summary */}
          <div className="delta-summary">
            <div className={`delta-pill ${result.comparison.delta.cost > 0 ? 'negative' : 'positive'}`}>
              Cost: {result.comparison.delta.cost > 0 ? '+' : ''}₹{result.comparison.delta.cost.toFixed(0)}
            </div>
            <div className={`delta-pill ${result.comparison.delta.duration_min > 0 ? 'negative' : 'positive'}`}>
              Time: {result.comparison.delta.duration_min > 0 ? '+' : ''}{result.comparison.delta.duration_min.toFixed(0)}min
            </div>
            <div className="delta-pill neutral">
              {result.routes_affected} routes affected
            </div>
          </div>

          {/* Recommendation */}
          <div className="recommendation-box">
            <span className="rec-label">AI RECOMMENDATION</span>
            <p className="rec-text">{result.recommendation}</p>
          </div>

          {/* Explainability */}
          {result.explanation && (
            <div className="explanation-box">
              <span className="exp-label">WHY THIS HAPPENED</span>
              <p className="exp-text">{result.explanation.trigger_explanation || result.explanation.primary_rationale}</p>
              {result.explanation.impact && (
                <p className="exp-impact">{result.explanation.impact.explanation}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SimulationPanel;
