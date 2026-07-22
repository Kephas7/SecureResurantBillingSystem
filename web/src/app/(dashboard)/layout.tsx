"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { UtensilsCrossed, LogOut, PanelLeftClose, PanelLeftOpen, UserCircle } from "lucide-react";
import { useAuth } from "../../context/auth.context";
import { navSectionsForRole } from "../../lib/nav-items";
import { roleBadgeClass } from "../../lib/roles";

const SIDEBAR_EXPANDED_WIDTH = "248px";
const SIDEBAR_COLLAPSED_WIDTH = "64px";

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function DashboardLayout({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    if (user.passwordExpired) {
      router.replace("/password-expired");
      return;
    }
  }, [isLoading, user, router]);

  // Restores the sidebar's expanded/collapsed state on navigation -
  // read once on mount rather than via useState's initializer since
  // localStorage isn't available during server-side rendering.
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleSidebar(): void {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  async function handleLogout(): Promise<void> {
    await logout();
    router.push("/login");
  }

  if (isLoading || !user || user.passwordExpired) {
    return null;
  }

  const sections = navSectionsForRole(user.role);

  return (
    <div className="layout">
      <aside
        className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
      >
        <Link href="/dashboard" className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <UtensilsCrossed size={18} color="white" />
          </div>
          <span className="sidebar-logo-text">Big Bites</span>
        </Link>

        <div className="sidebar-toggle-wrap">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Navigation items are hidden based on role for UX only. The
            server enforces access on every API call regardless of what
            this sidebar shows - a user who manually navigates to
            /admin/users without the ADMIN role will see an empty page
            or error, because every request that page makes returns 403
            from RolesGuard. */}
        <nav className="sidebar-nav">
          {sections.map((section, index) => (
            <div key={section.label ?? `section-${index}`}>
              {section.label && <div className="sidebar-section">{section.label}</div>}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`nav-link${isActive ? " active" : ""}`}
                    title={item.label}
                  >
                    <Icon size={16} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          <div>
            <div className="sidebar-section">Account</div>
            <Link
              href="/profile"
              className={`nav-link${pathname === "/profile" ? " active" : ""}`}
              title="Profile"
            >
              <UserCircle size={16} />
              <span className="nav-label">Profile</span>
            </Link>
          </div>
        </nav>

        <div className="sidebar-user">
          <Link
            href="/profile"
            className="sidebar-user-info"
            title={`${user.fullName} (${user.role}) - view profile`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="avatar">{initials(user.fullName)}</div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="user-name">{user.fullName}</div>
                <span className={`badge ${roleBadgeClass(user.role)}`}>{user.role}</span>
              </div>
            )}
          </Link>
          <button type="button" className="btn btn-primary w-full" style={{ justifyContent: "center" }} onClick={() => void handleLogout()}>
            <LogOut size={16} />
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <div className="main" style={{ marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}>
        {children}
      </div>
    </div>
  );
}
