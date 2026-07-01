"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../lib/api";

export interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ requiresMfa: boolean }>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Session lives in an httpOnly cookie the browser can't read directly,
    // so on every page load we ask the API who (if anyone) it is for.
    authApi
      .me()
      .then((me) => setUser({ id: me.id, email: me.email, role: me.role }))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<{ requiresMfa: boolean }> {
    const result = await authApi.login(email, password);

    if (!result.requiresMfa) {
      const me = await authApi.me();
      setUser({ id: me.id, email: me.email, role: me.role });
    }

    return { requiresMfa: result.requiresMfa };
  }

  async function logout(): Promise<void> {
    await authApi.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
