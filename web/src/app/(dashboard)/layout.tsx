"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { UtensilsCrossed, LogOut } from "lucide-react";
import { useAuth } from "../../context/auth.context";
import { navSectionsForRole } from "../../lib/nav-items";
import { roleBadgeClass } from "../../lib/roles";

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

  const sections = navSectionsForRole(user.role);

  return (
    <div className="layout">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-logo">
          <UtensilsCrossed size={20} />
          Restaurant Secure
        </Link>

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
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="avatar">{initials(user.fullName)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="user-name">{user.fullName}</div>
              <span className={`badge ${roleBadgeClass(user.role)}`}>{user.role}</span>
            </div>
          </div>
          <button type="button" className="btn btn-primary w-full" style={{ justifyContent: "center" }} onClick={() => void handleLogout()}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <div className="main">{children}</div>
    </div>
  );
}
