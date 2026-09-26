"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

type Role = "rider" | "driver" | "admin";

type AuthUser = {
  id: string;
  name?: string;
  phone: string;
  role: Role;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginWithToken: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "sawarika_auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string; user: AuthUser };
        setToken(parsed.token);
        setUser(parsed.user);
      }
    } catch {
      // corrupted storage, ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithToken = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: newUser }));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, loginWithToken, logout }),
    [user, token, loading, loginWithToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export async function requestOtp(phone: string) {
  return api<{ message: string }>("/auth/send-otp", { method: "POST", body: { phone } });
}

export async function verifyOtp(phone: string, otp: string, name?: string) {
  return api<{ token: string; user: AuthUser }>("/auth/verify-otp", {
    method: "POST",
    body: { phone, otp, name },
  });
}
