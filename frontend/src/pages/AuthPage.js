import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../services/firebase/config';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import './AuthPage.css';

const AuthPage = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState('driver'); // Default to driver
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
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                // Note: In a production system, you would call a backend function 
                // here to set custom claims (admin/driver) via the Firebase Admin SDK.
            }
            onAuthSuccess(role);
            navigate(role === 'admin' ? '/admin' : '/driver');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            onAuthSuccess(role);
            navigate(role === 'admin' ? '/admin' : '/driver');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>{isLogin ? 'Welcome Back' : 'Join the Fleet'}</h1>
                    <p>{isLogin ? 'Secure login for industrial logistics' : 'Register your asset in the Orion network'}</p>
                </div>

                <div className="role-selector">
                    <button 
                        className={`role-btn ${role === 'driver' ? 'active' : ''}`}
                        onClick={() => setRole('driver')}
                    >
                        Driver
                    </button>
                    <button 
                        className={`role-btn ${role === 'admin' ? 'active' : ''}`}
                        onClick={() => setRole('admin')}
                    >
                        Admin
                    </button>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleAuth} className="auth-form">
                    <div className="form-group">
                        <label>Email Address</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="agent@tnimpact.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>

                <div className="auth-divider">
                    <span>OR</span>
                </div>

                <button onClick={handleGoogleAuth} className="google-auth-btn" disabled={loading}>
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" />
                    {isLogin ? 'Sign in with Google' : 'Sign up with Google'}
                </button>

                <div className="auth-footer">
                    <button onClick={() => setIsLogin(!isLogin)} className="toggle-auth-btn">
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
