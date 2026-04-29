import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, adminSignup } from '@services/backendAuthService';
import { login as firebaseLogin } from '@services/firebaseService';
import './AuthPage.css';

const AdminAuthPage = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isLogin) {
                // 1. Backend Login
                const data = await adminLogin(email, password);
                
                // 2. Firebase Login (to enable real-time sync with rules)
                try {
                    await firebaseLogin(email, password);
                } catch (fErr) {
                    console.warn("[Auth] Firebase login failed, but backend succeeded. Snapshots might fail:", fErr);
                }

                onAuthSuccess({ email, role: 'admin' }, 'admin');
            } else {
                await adminSignup(email, password);
                setIsLogin(true);
                setError('Admin account created. Please login.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container admin-theme">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="badge admin-badge">ADMIN CONTROL</div>
                    <h1>{isLogin ? 'Command Center' : 'Establish Command'}</h1>
                    <p>{isLogin ? 'Authenticate to manage fleet operations' : 'Register a new administrative account'}</p>
                </div>

                {error && <div className={`auth-error ${error.includes('created') ? 'success' : ''}`}>{error}</div>}

                <form onSubmit={handleAuth} className="auth-form">
                    <div className="form-group">
                        <label>Admin Email</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="admin@tnimpact.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Security Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="auth-submit-btn admin-btn" disabled={loading}>
                        {loading ? 'Processing...' : (isLogin ? 'Enter Dashboard' : 'Create Admin')}
                    </button>
                </form>

                <div className="auth-footer">
                    <button onClick={() => setIsLogin(!isLogin)} className="toggle-auth-btn">
                        {isLogin ? "Need a new admin account? Register" : "Already have an account? Login"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminAuthPage;
