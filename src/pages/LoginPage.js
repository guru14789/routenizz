/**
 * USES: User authentication portal.
 * SUPPORT: Provides the UI and logic for logging into the TNImpact system or creating new accounts, integrated with Firebase Auth.
 */
import React, { useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { login, signUp } from '../services/firebaseService';
import { loginToBackend } from '../services/backendAuthService';

const LoginPage = ({ onLogin, mode = 'login' }) => {
    const [isLogin, setIsLogin] = useState(mode === 'login');
    const navigate = useNavigate();
    const [role, setRole] = useState('driver'); // 'driver' or 'admin'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                const { user, role: userRole } = await login(email, password);
                
                // CRITICAL: Bridging Firebase and Backend Security
                // If this is an Admin, we MUST also authenticate with the FastAPI backend
                // to get the JWT token needed for our route optimization features.
                if (userRole === 'admin') {
                    const backendUser = email.split('@')[0]; // Extract prefix (e.g., 'admin')
                    // For the demo environment, we ensure we have a valid token
                    await loginToBackend(backendUser, password);
                }
                
                onLogin({ email: user.email, role: userRole });
            } else {
                const { user, role: userRole } = await signUp(email, password, role);
                
                if (userRole === 'admin') {
                    const backendUser = email.split('@')[0];
                    await loginToBackend(backendUser, password);
                }
                
                onLogin({ email: user.email, role: userRole });
            }
        } catch (error) {
            console.error("Auth error:", error);
            setErrorMsg(error.message);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="login-screen">
            <div className="login-side-pane">
                <div className="pane-content">
                    <div className="brand-badge">LOGISTICS TERMINAL</div>
                    <div className="brand-logo">
                        <span className="logo-symbol">R</span>
                        <span className="logo-text">Routenizz</span>
                    </div>
                    <div className="brand-tagline">
                        PRECISION NAVIGATION. 
                        INDUSTRIAL RELIABILITY.
                        AI-OPTIMIZED FREIGHT.
                    </div>
                </div>
                <div className="pane-footer">
                    SYSTEM VERSION: 2.1.0-ORION
                </div>
            </div>

            <div className="login-form-pane">
                <div className="form-container">
                    <div className="form-header">
                        <h2>{isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}</h2>
                        <p>{isLogin ? 'AUTHENTICATE FOR TERMINAL ACCESS' : 'INITIALIZE NEW FLEET ACCOUNT'}</p>
                    </div>

                    <div className="role-toggle" style={{ marginBottom: '2rem', display: 'flex', border: '2px solid #000', padding: '2px' }}>
                        <button
                            className={role === 'driver' ? 'active' : ''}
                            onClick={() => setRole('driver')}
                            style={{ flex: 1, padding: '8px', border: 'none', background: role === 'driver' ? '#000' : '#fff', color: role === 'driver' ? '#fff' : '#000', cursor: 'pointer', fontWeight: 800, fontSize: '10px' }}
                        >
                            DRIVER
                        </button>
                        <button
                            className={role === 'admin' ? 'active' : ''}
                            onClick={() => setRole('admin')}
                            style={{ flex: 1, padding: '8px', border: 'none', background: role === 'admin' ? '#000' : '#fff', color: role === 'admin' ? '#fff' : '#000', cursor: 'pointer', fontWeight: 800, fontSize: '10px' }}
                        >
                            ADMIN
                        </button>
                    </div>

                    {errorMsg && <div className="auth-error" style={{ color: '#fff', fontSize: '10px', marginBottom: '1rem', background: '#000', padding: '12px', border: '2px solid #ff0000' }}>[ERROR] {errorMsg}</div>}

                    <form onSubmit={handleSubmit} className="premium-form">
                        <div className="input-field">
                            <label>IDENTIFIER / EMAIL</label>
                            <input
                                type="email"
                                placeholder="name@terminal.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-field">
                            <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label>SECURITY KEY</label>
                                {isLogin && <a href="#forgot" style={{ fontSize: '10px', color: '#000', fontWeight: 700 }}>RECOVERY</a>}
                            </div>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="prime-login-btn" disabled={isLoading}>
                            {isLoading ? 'EXECUTING...' : (isLogin ? `CONNECT AS ${role.toUpperCase()}` : 'INITIALIZE')}
                        </button>
                    </form>

                    <div className="switch-auth" style={{ marginTop: '24px', fontSize: '11px', textAlign: 'center' }}>
                        <span>{isLogin ? "NO ACCOUNT?" : "EXISTING ACCOUNT?"}</span>
                        <button 
                            onClick={() => navigate(isLogin ? '/signup' : '/login')}
                            style={{ background: 'none', border: 'none', fontWeight: 800, cursor: 'pointer', marginLeft: '8px', textDecoration: 'underline' }}
                        >
                            {isLogin ? "REGISTER NOW" : "LOGIN"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
