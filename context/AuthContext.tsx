import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // 🔑 CRITICAL FIX: localStorage se turant user initialize karo
  // Taaki app open hone par Firebase confirm karne se pehle currentUser null na rahe
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const storedUser = localStorage.getItem('ali_enterprises_user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {
      return null;
    }
  });

  // Track whether user explicitly logged out
  const isExplicitLogout = React.useRef(false);

  // loading = false if we already have a cached user (prevents flicker)
  const [loading, setLoading] = useState(() => {
    const storedUser = localStorage.getItem('ali_enterprises_user');
    return !storedUser; // Agar cached user hai toh loading false start karo
  });

  const login = async (email: string, password: string): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  };

  const register = async (email: string, password: string): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  };

  const logout = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    try {
      // Flag: yeh genuine logout hai
      isExplicitLogout.current = true;
      await signOut(auth);
      localStorage.removeItem('ali_enterprises_user');
      setCurrentUser(null);
    } catch (error: any) {
      isExplicitLogout.current = false;
      throw new Error(error.message || 'Logout failed');
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      throw new Error(error.message || 'Google login failed');
    }
  };

  useEffect(() => {
    if (!auth) {
      console.warn('Firebase auth not available, using fallback');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        // Reset logout flag on successful login
        isExplicitLogout.current = false;
        const isAdmin = user.email?.toLowerCase() === 'alienterprese@gmail.com';
        const userData: User = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          isAdmin: isAdmin,
        };
        setCurrentUser(userData);
        localStorage.setItem('ali_enterprises_user', JSON.stringify(userData));
      } else {
        // ⚠️ CRITICAL: Firebase temporarily null return karta hai jab:
        //   - Screen lock hoti hai (Android)
        //   - App background mein jata hai
        //   - Network temporarily disconnect hota hai
        // SIRF explicit logout par hi user clear karo!
        if (isExplicitLogout.current) {
          console.log('✅ Genuine logout detected — clearing user state.');
          setCurrentUser(null);
          localStorage.removeItem('ali_enterprises_user');
          isExplicitLogout.current = false;
        } else {
          console.log('⚠️ Firebase returned null (screen lock/background). Keeping cached user — NOT clearing data.');
          // Cached user ko waise hi rakho, sirf loading hatao
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value: AuthContextType = {
    currentUser,
    login,
    register,
    logout,
    loginWithGoogle,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
