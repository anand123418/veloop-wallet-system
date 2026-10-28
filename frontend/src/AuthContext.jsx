import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(Boolean(tokenStore.get()));
  const [user, setUser] = useState(null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setAuthed(false);
  }, []);

  // The api client fires this when the server answers 401.
  useEffect(() => {
    window.addEventListener("veloop:unauthorized", logout);
    return () => window.removeEventListener("veloop:unauthorized", logout);
  }, [logout]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    tokenStore.set(data.token);
    setUser(data.user || null);
    setAuthed(true);
  };

  const register = async (email, name, password, referralCode) => {
    const data = await api.register(email, name, password, referralCode);
    tokenStore.set(data.token);
    setUser(data.user || null);
    setAuthed(true);
  };

  return <AuthContext.Provider value={{ authed, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
