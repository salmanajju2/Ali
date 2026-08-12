import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { firebaseAuth } from '../services/firebase';

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
  loading: boolean;
}

const ADMIN_EMAILS = new Set(['alienterprese@gmail.com']);

const toAppUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || null,
  isAdmin: Boolean(firebaseUser.email && ADMIN_EMAILS.has(firebaseUser.email.toLowerCase())),
});

const friendlyAuthError = (error: unknown): Error => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: string }).code)
    : '';

  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return new Error('Invalid email or password.');
  }
  if (code === 'auth/too-many-requests') {
    return new Error('Too many attempts. Please wait a few minutes and try again.');
  }
  if (code === 'auth/network-request-failed') {
    return new Error('Network error. Please check your internet connection and try again.');
  }
  if (code === 'auth/email-already-in-use') {
    return new Error('This email already has an account. Please sign in instead.');
  }
  if (code === 'auth/weak-password') {
    return new Error('Password must contain at least 6 characters.');
  }

  return new Error('Authentication could not be completed. Please try again.');
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setCurrentUser(firebaseUser ? toAppUser(firebaseUser) : null);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      setCurrentUser(toAppUser(credential.user));
    } catch (error) {
      throw friendlyAuthError(error);
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      setCurrentUser(toAppUser(credential.user));
    } catch (error) {
      throw friendlyAuthError(error);
    }
  };

  const logout = async () => {
    await signOut(firebaseAuth);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
