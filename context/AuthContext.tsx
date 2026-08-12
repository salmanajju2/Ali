import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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

interface AuthResponse {
  user: User;
  token: string;
}

const USER_STORAGE_KEY = 'ali_enterprises_user';
const TOKEN_STORAGE_KEY = 'ali_enterprises_session_token';
const API_ORIGIN = typeof window === 'undefined' ? '' : window.location.origin;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || 'Authentication request failed.';
  } catch {
    return 'Authentication request failed.';
  }
}

async function authRequest(path: string, payload?: Record<string, string>): Promise<AuthResponse> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

function saveSession(user: User, token: string) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearSession() {
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) as User : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_ORIGIN}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Session expired');
        const { user } = await response.json();
        setCurrentUser(user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } catch {
        clearSession();
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const { user, token } = await authRequest('/api/auth/login', { email, password });
    saveSession(user, token);
    setCurrentUser(user);
  };

  const register = async (email: string, password: string) => {
    const { user, token } = await authRequest('/api/auth/register', { email, password });
    saveSession(user, token);
    setCurrentUser(user);
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    try {
      await fetch(`${API_ORIGIN}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } finally {
      clearSession();
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
