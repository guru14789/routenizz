import React from 'react';

/**
 * ORION-ELITE Frontend Stability — Phase 1
 * A robust Error Boundary component to prevent the entire dashboard 
 * from crashing due to unexpected UI errors or API failures.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service like Sentry
    console.error('[ErrorBoundary] Caught UI exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          margin: '20px',
          border: '1px solid #fee2e2'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ color: '#b91c1c', marginBottom: '10px' }}>Something went wrong</h2>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>
            The dashboard encountered an unexpected error. Don't worry, your data is safe.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Refresh Dashboard
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '24px', textAlign: 'left', fontSize: '12px' }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280' }}>Error Details (Dev Only)</summary>
              <pre style={{ backgroundColor: '#f3f4f6', padding: '12px', overflowX: 'auto', marginTop: '8px' }}>
                {this.state.error && this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
