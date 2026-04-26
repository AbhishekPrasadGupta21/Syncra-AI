import { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, clearToken, getToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const loginWithGoogle = async () => {
    const { data } = await api.get("/auth/google/login");
    window.location.href = data.authorization_url;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    clearToken();
    setUser(null);
    window.location.href = "/login";
  };

  const handleCallback = async (token) => {
    setToken(token);
    return refresh();
  };

  return (
    <AuthCtx.Provider value={{ user, loading, loginWithGoogle, logout, refresh, handleCallback }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
