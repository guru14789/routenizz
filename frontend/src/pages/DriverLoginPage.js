import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverLogin } from '@services/backendAuthService';
import { login as firebaseLogin } from '@services/firebaseService';
import './AuthPage.css';

const DriverLoginPage = ({ onAuthSuccess }) => {
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            // 1. Backend Login
            const data = await driverLogin(email, pin);
            
            // 2. Firebase Login (Drivers use TN + PIN as password)
            try {
                await firebaseLogin(email, "TN" + pin);
            } catch (fErr) {
                console.warn("[Auth] Driver Firebase login failed:", fErr);
            }

            onAuthSuccess({ email, role: 'driver', vehicle_id: data.vehicle_id }, 'driver');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container driver-theme">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="badge driver-badge">FLEET DRIVER</div>
                    <h1>Driver Login</h1>
                    <p>Enter your registered Gmail and unique PIN provided by Admin</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleLogin} className="auth-form">
                    <div className="form-group">
                        <label>Registered Gmail</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="driver@gmail.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Unique PIN (OTP)</label>
                        <input 
                            type="text" 
                            maxLength="6"
                            value={pin} 
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} 
                            placeholder="6-Digit PIN"
                            required
                        />
                    </div>

                    <button type="submit" className="auth-submit-btn driver-btn" disabled={loading}>
                        {loading ? 'Authenticating...' : 'Access My Route'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p className="help-text">Don't have a PIN? Contact your Dispatcher.</p>
                </div>
            </div>
        </div>
    );
};

export default DriverLoginPage;
