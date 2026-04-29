import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribeToAuthChanges } from '@services/firebaseService';
import { syncWithBackend as backendSync } from '@services/backendAuthService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [firebaseReady, setFirebaseReady] = useState(false);
    const [userOverrideRole, setUserOverrideRole] = useState(null);

    useEffect(() => {
        // 1. Check for existing Backend session (Primary for SQL persistence)
        const savedToken = localStorage.getItem('backend_jwt_token');
        const savedRole = localStorage.getItem('user_role');
        const savedEmail = localStorage.getItem('user_email');
        
        if (savedToken && savedRole) {
            console.log(`[AuthContext] Restoring session: ${savedRole}`);
            setUser({ email: savedEmail || 'Admin', role: savedRole });
            setAuthLoading(false);
        }

        // 2. Listen for Firebase Auth changes (Real-time sync)
        const unsubscribe = subscribeToAuthChanges((currentUser) => {
            if (currentUser) {
                // Stabilize state: only update if uid or email changed
                setUser(prev => {
                    if (prev?.uid === currentUser.uid && prev?.email === currentUser.email) return prev;
                    console.log(`[AuthContext] Firebase Session Confirmed: ${currentUser.email}`);
                    return { ...prev, ...currentUser };
                });
                
                setFirebaseReady(true);
                setAuthLoading(false);
                
                // Sync Firebase ID Token without overwriting backend session
                backendSync().catch(e => console.warn('[Auth] Token sync failed:', e));
            } else {
                if (firebaseReady) setFirebaseReady(false);
                if (!savedToken) {
                    console.log("[AuthContext] No session found, logging out.");
                    setUser(null);
                }
                setAuthLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const activeRole = userOverrideRole || user?.role;

    return (
        <AuthContext.Provider value={{ 
            user, 
            authLoading, 
            firebaseReady,
            userOverrideRole, 
            setUserOverrideRole, 
            setUser,
            activeRole
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
