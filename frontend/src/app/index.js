/**
 * USES: Main client-side entry point for the React application.
 * SUPPORT: Bootstraps the React DOM, injects the root App component into the HTML template, and initializes global styles.
 */
import React from 'react'; // Import React core for component rendering
import ReactDOM from 'react-dom/client'; // Import React DOM for browser mounting
import '../shared/styles/index.css'; // Import the global design system and Leaflet CSS
import App from './App'; // Import the root application orchestrator

// Create the concurrent React root attached to the 'root' div in index.html
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the application within a StrictMode wrapper to catch potential bugs early in development
root.render(
    <React.StrictMode>
        <App /> {/* Mount the main App component branch */}
    </React.StrictMode>
);
