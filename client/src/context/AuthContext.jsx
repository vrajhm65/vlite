import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem('vlite_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [token, setToken] = useState(() => localStorage.getItem('vlite_token'));
  const [loading, setLoading] = useState(true);

  // Verify stored session on mount
  useEffect(() => {
    const storedUser = readStoredUser();
    const storedToken = localStorage.getItem('vlite_token');

    if (!storedToken) {
      setLoading(false);
      return;
    }

    api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;

    // Participant sessions are verified by the Socket.IO layer
    // (JWT verified server-side on every connection). No /me lookup needed.
    if (storedUser?.role === 'participant') {
      setUser(storedUser);
      setToken(storedToken);
      setLoading(false);
      return;
    }

    // Host session: verify token by fetching user info
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        persistUser(res.data.user);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistUser = (userData) => {
    if (userData) {
      localStorage.setItem('vlite_user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('vlite_user');
    }
  };

  const login = useCallback((userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('vlite_token', authToken);
    persistUser(userData);
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  }, []);

  const loginParticipant = useCallback((participantData, authToken) => {
    const participantUser = {
      role: 'participant',
      name: participantData.participantName,
      roomId: participantData.roomId,
      lrn: participantData.lrn,
      sessionId: participantData.sessionId,
    };
    setUser(participantUser);
    setToken(authToken);
    localStorage.setItem('vlite_token', authToken);
    persistUser(participantUser);
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('vlite_token');
    localStorage.removeItem('vlite_user');
    delete api.defaults.headers.common['Authorization'];
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, loginParticipant, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
