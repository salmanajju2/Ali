import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { API_ORIGIN } from '../services/apiConfig';
import { firebaseAuth } from '../services/firebase';

const TOKEN_STORAGE_KEY = 'ali_enterprises_firebase_id_token';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const storeToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Firebase remains the source of truth if browser storage is unavailable.
  }
};

export const getSessionToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const refreshSessionToken = async (): Promise<string | null> => {
  const firebaseUser = firebaseAuth.currentUser;
  if (!firebaseUser) {
    storeToken(null);
    return null;
  }
  const token = await firebaseUser.getIdToken();
  storeToken(token);
  return token;
};

const mapFirebaseError = (error: any): Error => {
  const code = String(error?.code || '');
  const messages: Record<string, string> = {
    'auth/user-not-found': 'Yeh email registered nahi hai.',
    'auth/wrong-password': 'Password galat hai.',
    'auth/invalid-credential': 'Email ya password galat hai.',
    'auth/invalid-email': 'Email address sahi nahi hai.',
    'auth/email-already-in-use': 'Is email par account pehle se registered hai.',
    'auth/weak-password': 'Password kam az kam 6 characters ka hona chahiye.',
    'auth/too-many-requests': 'Bahut zyada attempts. Thodi der baad try karein.',
    'auth/network-request-failed': 'Network error. Internet check karein.',
  };
  return new Error(messages[code] || error?.message || 'Login failed. Please try again.');
};

const parseApiUser = async (response: Response): Promise<User> => {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the status-based error below.
  }
  if (!response.ok || !payload?.user) {
    throw new Error(payload?.error || `Authentication service failed (${response.status}).`);
  }
  return payload.user as User;
};

const hydrateBackendUser = async (firebaseUser: FirebaseUser): Promise<User> => {
  const token = await refreshSessionToken();
  if (!token) throw new Error('Firebase session token was not available.');
  const response = await fetch(`${API_ORIGIN}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
  });
  const user = await parseApiUser(response);
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || user.displayName,
    isAdmin: Boolean(user.isAdmin),
  };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        storeToken(null);
        setCurrentUser(null);
        setLoading(false);
        return;
      }
      try {
        const user = await hydrateBackendUser(firebaseUser);
        setCurrentUser(user);
      } catch (error) {
        console.error('Unable to hydrate backend Firebase user:', error);
        storeToken(null);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const user = await hydrateBackendUser(credential.user);
      setCurrentUser(user);
    } catch (error: any) {
      throw mapFirebaseError(error);
    }
  };

  const register = async (email: string, password: string, displayName?: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      if (displayName?.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      const user = await hydrateBackendUser(credential.user);
      setCurrentUser(user);
    } catch (error: any) {
      throw mapFirebaseError(error);
    }
  };

  const logout = async () => {
    try {
      await signOut(firebaseAuth);
    } finally {
      storeToken(null);
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
