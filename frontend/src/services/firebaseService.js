/**
 * USES: Data persistence and real-time synchronization service.
 * SUPPORT: Integrates Google Firebase for user authentication, cloud-hosted storage of orders, and live updates of fleet status.
 */
// Suppress SES intrinsics warnings from 3rd party libs
if (typeof window !== 'undefined') {
    window.SES_WARNINGS_SUPPRESSED = true;
}

import {

    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    onSnapshot
} from "firebase/firestore";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import { db, auth } from "./firebase/config";

// --- AUTHORIZATION POLICY ---
const OFFICIAL_ADMINS = [
    'varshini@gmail.com',
    'sureshkumar@gmail.com',
    'sreekumar.career@gmail.com',
    'admin@tnimpact.com'
];

/**
 * Resolves the role for a user based on hardcoded policy and Firestore data.
 */
const resolveRole = async (user, firestoreRole = null) => {
    const email = user.email.toLowerCase();
    
    // 1. Permanent Admin List & Domain Policy (Policy Override)
    if (OFFICIAL_ADMINS.includes(email) || 
        email.includes('admin') || 
        email.includes('suresh') ||
        email.includes('sree') ||
        email.endsWith('@tnimpact.com')) {
        return 'admin';
    }
    
    // 2. Fallback to Firestore role if provided
    if (firestoreRole) return firestoreRole;

    // 3. Last Resort: Default to driver
    return 'driver';
};

// --- AUTHENTICATION SERVICES ---

export const signUp = async (email, password, role) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Store extra user info in Firestore
        await addDoc(collection(db, "users"), {
            uid: user.uid,
            email: user.email,
            role: role,
            createdAt: new Date().toISOString()
        });

        return { user, role };
    } catch (error) {
        throw error;
    }
};

export const login = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch user role from Firestore
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        let roleData = 'driver'; // default
        querySnapshot.forEach((doc) => {
            roleData = doc.data().role;
        });

        const role = await resolveRole(user, roleData);
        return { user, role };
    } catch (error) {
        throw error;
    }
};

export const logout = () => signOut(auth);

export const getUserIdToken = async () => {
    const user = auth.currentUser;
    if (user) {
        return await user.getIdToken(true); // Force refresh for security
    }
    return null;
};

export const subscribeToAuthChanges = (callback) => {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Auth State Changed: User detected", user.email);
            try {
                const q = query(collection(db, "users"), where("uid", "==", user.uid));
                const querySnapshot = await getDocs(q);
                
                let firestoreRole = null;
                querySnapshot.forEach((doc) => {
                    firestoreRole = doc.data().role;
                });

                const role = await resolveRole(user, firestoreRole);
                console.log(`[Auth Policy] Verified ${user.email} -> Role: ${role}`);
                callback({ ...user, role });
            } catch (error) {
                console.error("Error fetching user role:", error);
                callback({ ...user, role: 'driver' });
            }
        } else {
            callback(null);
        }
    });
};

// --- DATA SERVICES (Orders & Drivers) ---

export const subscribeToOrders = (callback) => {
    const q = collection(db, "orders");
    return onSnapshot(q, 
        (snapshot) => {
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(orders);
        },
        (error) => {
            console.error("[Firestore] Orders subscription error:", error);
            // Don't clear callback if it's just a permission issue during reload
        }
    );
};

export const addOrder = (order) => {
    return addDoc(collection(db, "orders"), {
        ...order,
        createdAt: new Date().toISOString()
    });
};

export const updateOrder = (id, updates) => {
    const orderRef = doc(db, "orders", id);
    return updateDoc(orderRef, updates);
};

export const deleteOrder = (id) => {
    const orderRef = doc(db, "orders", id);
    return deleteDoc(orderRef);
};

export const subscribeToDrivers = (callback) => {
    const q = collection(db, "drivers");
    return onSnapshot(q, 
        (snapshot) => {
            const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(drivers);
        },
        (error) => {
            console.error("[Firestore] Drivers subscription error:", error);
        }
    );
};

export const addDriver = (driver) => {
    return addDoc(collection(db, "drivers"), {
        ...driver,
        createdAt: new Date().toISOString()
    });
};

export const updateDriver = (id, updates) => {
    const driverRef = doc(db, "drivers", id);
    return updateDoc(driverRef, updates);
};

export const deleteDriver = (id) => {
    const driverRef = doc(db, "drivers", id);
    return deleteDoc(driverRef);
};
