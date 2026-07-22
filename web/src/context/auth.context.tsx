"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authApi } from "../lib/api";

// Extends the plan's minimal { id, email, role } shape with fullName -
// the dashboard greets the user by name, and /auth/me already returns it,
// so there is no reason to drop it here.
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  passwordExpired: boolean;
  passwordChangedAt: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<{ requiresMfa: boolean }>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Pages reachable before a full auth state exists. /auth/me legitimately
// 401s on these (e.g. mid-MFA-flow, or no session at all yet), so there is
// nothing useful to restore and calling it would just add noise.
const SKIP_ME_CHECK_PATHS = ["/login", "/mfa-verify", "/forgot-password", "/reset-password"];

function toUser(me: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  passwordExpired: boolean;
  passwordChangedAt: string;
}): User {
  return {
    id: me.id,
    email: me.email,
    fullName: me.fullName,
    role: me.role,
    passwordExpired: me.passwordExpired,
    passwordChangedAt: me.passwordChangedAt,
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && SKIP_ME_CHECK_PATHS.includes(window.location.pathname)) {
      setIsLoading(false);
      return;
    }

    // Session lives in an httpOnly cookie the browser can't read directly,
    // so on every page load we ask the API who (if anyone) it is for.
    authApi
      .me()
      .then((me) => setUser(toUser(me)))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  // Centralised password-expiry gate: wherever `user` gets set (initial
  // load, login, MFA verification), redirect to the forced-change screen
  // if the password is expired. Kept here rather than duplicated at each
  // setUser call site so a new caller can't forget the check.
  useEffect(() => {
    if (user?.passwordExpired && pathname !== "/password-expired") {
      router.replace("/password-expired");
    }
  }, [user, pathname, router]);

  async function login(
    email: string,
    password: string,
    captchaToken?: string,
  ): Promise<{ requiresMfa: boolean }> {
    const result = await authApi.login(email, password, captchaToken);

    if (!result.requiresMfa) {
      const me = await authApi.me();
      setUser(toUser(me));
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
