"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth.context";

export default function DashboardLayout({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  async function handleLogout(): Promise<void> {
    await logout();
    router.push("/login");
  }

  if (isLoading || !user) {
    return null;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.5rem",
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <strong>Restaurant Secure</strong>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span>
            {user.email} <span style={{ color: "var(--color-text-muted)" }}>({user.role})</span>
          </span>
          <button type="button" onClick={() => void handleLogout()}>
            Logout
          </button>
        </div>
      </nav>
      <main style={{ padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
