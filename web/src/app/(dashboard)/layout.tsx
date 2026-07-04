"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/auth.context";
import { navItemsForRole } from "../../lib/nav-items";

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

  const navItems = navItemsForRole(user.role);

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
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link href="/dashboard" style={{ fontWeight: 700, color: "inherit" }}>
            Restaurant Secure
          </Link>

          {/* Navigation items are hidden based on role for UX only. The
              server enforces access on every API call regardless of what
              this bar shows - a user who manually navigates to
              /admin/users without the ADMIN role will see an empty page
              or error, because every request that page makes returns 403
              from RolesGuard. */}
          <div style={{ display: "flex", gap: "1rem" }}>
            {navItems.map((item) =>
              item.comingSoon ? (
                <span
                  key={item.label}
                  title="Coming soon"
                  style={{ color: "var(--color-text-muted)", cursor: "not-allowed" }}
                >
                  {item.label}
                </span>
              ) : (
                <Link key={item.label} href={item.href} style={{ color: "inherit" }}>
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span>
            {user.fullName} <span style={{ color: "var(--color-text-muted)" }}>({user.role})</span>
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
