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
                    <div className="brand-badge">PREMIUM LOGISTICS</div>
                    <div className="brand-logo">
                        <span className="logo-symbol">R</span>
                        <span className="logo-text">Routenizz</span>
                    </div>
                    <div className="brand-tagline">
                        Precision navigation for the modern logistics industry.
                        Optimize your journey with state-of-the-art routing AI.
                    </div>
                </div>
                <div className="pane-footer">
                    © 2026 Routenizz Inc. All rights reserved.
                </div>
            </div>

            <div className="login-form-pane">
                <div className="form-container">
                    <div className="form-header">
                        <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
                        <p>{isLogin ? 'Enter your credentials to access your dashboard' : 'Join our network of precision logistics'}</p>
                    </div>

                    <div className="role-toggle">
                        <button
                            className={role === 'driver' ? 'active' : ''}
                            onClick={() => setRole('driver')}
                        >
                            Driver
                        </button>
                        <button
                            className={role === 'admin' ? 'active' : ''}
                            onClick={() => setRole('admin')}
                        >
                            Administrator
                        </button>
                    </div>

                    {errorMsg && <div className="auth-error" style={{ color: '#ff4d4d', fontSize: '0.85rem', marginBottom: '1rem', background: '#fff1f1', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #ffcccc' }}>{errorMsg}</div>}

                    <form onSubmit={handleSubmit} className="premium-form">
                        <div className="input-field">
                            <label>Email Address</label>
                            <input
                                type="email"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-field">
                            <div className="label-row">
                                <label>Password</label>
                                {isLogin && <a href="#forgot" className="forgot-link">Forgot password?</a>}
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
                            {isLoading ? 'Processing...' : (isLogin ? `Continue as ${role === 'driver' ? 'Driver' : 'Admin'}` : 'Get Started')}
                        </button>
                    </form>

                    <div className="switch-auth">
                        <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
                        <button onClick={() => navigate(isLogin ? '/signup' : '/login')}>
                            {isLogin ? "Sign up now" : "Go to login"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
