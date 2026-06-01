"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { login as apiLogin, setToken, clearToken, type LoginRequest, type LoginResponse } from "@/lib/api";

interface AuthState {
  token: string | null;
  role: string | null;
  userId: string | null;
  email: string | null;
  username: string | null;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (data: LoginRequest) => Promise<LoginResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") {
      return { token: null, role: null, userId: null, email: null, username: null, isAuthenticated: false };
    }
    const token    = localStorage.getItem("icode_ctf_token");
    const role     = localStorage.getItem("icode_ctf_role");
    const userId   = localStorage.getItem("icode_ctf_userId");
    const email    = localStorage.getItem("icode_ctf_email");
    const username = localStorage.getItem("icode_ctf_username");
    return { token, role, userId, email, username, isAuthenticated: !!token };
  });

  const login = useCallback(async (data: LoginRequest) => {
    const res = await apiLogin(data);
    setToken(res.token);
    localStorage.setItem("icode_ctf_role",     res.role);
    localStorage.setItem("icode_ctf_userId",   res.userId);
    localStorage.setItem("icode_ctf_email",    res.email);
    localStorage.setItem("icode_ctf_username", res.username);
    document.cookie = `token=${res.token}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `role=${res.role}; path=/; max-age=86400; SameSite=Strict`;
    setState({ token: res.token, role: res.role, userId: res.userId, email: res.email, username: res.username, isAuthenticated: true });
    return res;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem("icode_ctf_role");
    localStorage.removeItem("icode_ctf_userId");
    localStorage.removeItem("icode_ctf_email");
    localStorage.removeItem("icode_ctf_username");
    document.cookie = `token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    setState({ token: null, role: null, userId: null, email: null, username: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
