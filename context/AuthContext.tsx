import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_ORIGIN } from '../services/apiConfig';

const SESSION_STORAGE_KEY = 'ali_enterprises_session_token';

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

export const getSessionToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
};

const setSessionToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private WebView modes; the in-memory user
    // state still protects the current session until the page is reloaded.
  }
};

const authHeaders = (): HeadersInit => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseAuthResponse = async (response: Response) => {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the generic status error below for non-JSON responses.
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Authentication request failed (${response.status}).`);
  }
  if (!payload?.user) throw new Error('Authentication response was incomplete.');
  return payload;
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
    const token = getSessionToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_ORIGIN}/api/auth/me`, {
      headers: authHeaders(),
      credentials: 'omit',
    })
      .then(parseAuthResponse)
      .then(({ user }) => setCurrentUser(user))
      .catch(() => {
        setSessionToken(null);
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const payload = await parseAuthResponse(response);
    setSessionToken(payload.token);
    setCurrentUser(payload.user);
  };

  const register = async (email: string, password: string, displayName?: string) => {
    const response = await fetch(`${API_ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ email: email.trim(), password, displayName }),
    });
    const payload = await parseAuthResponse(response);
    setSessionToken(payload.token);
    setCurrentUser(payload.user);
  };

  const logout = async () => {
    const token = getSessionToken();
    try {
      if (token) {
        await fetch(`${API_ORIGIN}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'omit',
        });
      }
    } finally {
      setSessionToken(null);
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
