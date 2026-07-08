"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Grid3x3, ClipboardList } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { navItemsForRole } from "../../../lib/nav-items";
import { usersApi, tablesApi, ordersApi } from "../../../lib/api";

interface DashboardStats {
  totalStaff: number | null;
  tablesOccupied: number | null;
  totalTables: number | null;
  todaysOrders: number | null;
}

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

// Role-based UI rendering is a UX convenience only. Access control is
// enforced server-side via RolesGuard on every API endpoint (see
// api/src/common/guards/roles.guard.ts, which re-fetches the role from
// the DB rather than trusting the client). Hiding a card here does not
// prevent a technical user from calling the underlying API directly -
// that request would be rejected by RolesGuard regardless of what this
// page renders.
export default function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalStaff: null,
    tablesOccupied: null,
    totalTables: null,
    todaysOrders: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const isAdmin = user?.role === "ADMIN";
  // /tables is ADMIN/MANAGER/CASHIER/WAITER server-side - KITCHEN has no
  // reason to view table occupancy and would 403 if this card tried to
  // fetch it on their behalf.
  const canViewTables = user?.role !== "KITCHEN";

  useEffect(() => {
    if (!user) {
      setStatsLoading(false);
      return;
    }

    Promise.all([
      // /users is ADMIN-only server-side - only ever requested as ADMIN,
      // never on behalf of any other role (that call would 403 regardless).
      isAdmin ? usersApi.getAll() : Promise.resolve(null),
      canViewTables ? tablesApi.getAll() : Promise.resolve(null),
      // /orders is reachable by every role, but WAITER only ever sees
      // their own orders (IDOR protection in OrdersService) - "today's
      // orders" for a waiter reflects their own count, not the whole
      // restaurant's, which is the correct scoping for that role anyway.
      ordersApi.getAll(),
    ])
      .then(([users, tables, orders]) => {
        setStats({
          totalStaff: users ? users.filter((u) => u.isActive).length : null,
          tablesOccupied: tables ? tables.filter((t) => t.status === "OCCUPIED").length : null,
          totalTables: tables ? tables.length : null,
          todaysOrders: orders.filter((o) => isToday(o.createdAt)).length,
        });
      })
      .catch(() => {
        // Stat cards are a convenience overview, not critical data - if
        // any of these fail, the page still renders with what it has.
      })
      .finally(() => setStatsLoading(false));
  }, [user, isAdmin, canViewTables]);

  if (!user) {
    return <p>Loading...</p>;
  }

  const quickActions = navItemsForRole(user.role).filter((item) => item.description);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {user.fullName}</h1>
          <p className="page-subtitle">Here&apos;s what&apos;s happening at your restaurant today.</p>
        </div>
      </div>

      <div className="page-content">
        <div className="stat-grid" style={{ marginBottom: "2rem" }}>
          {isAdmin && (
            <div className="stat-card">
              <div className="stat-label">
                <span
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    background: "var(--info-light)",
                    color: "var(--info)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Users size={13} />
                </span>
                Total Staff
              </div>
              <div className="stat-value">{statsLoading ? "—" : stats.totalStaff}</div>
              <div className="stat-sub">active staff</div>
            </div>
          )}

          {canViewTables && (
            <div className="stat-card">
              <div className="stat-label">
                <span
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    background: "var(--brand-light)",
                    color: "var(--brand)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Grid3x3 size={13} />
                </span>
                Tables Occupied
              </div>
              <div className="stat-value">{statsLoading ? "—" : stats.tablesOccupied}</div>
              <div className="stat-sub">{statsLoading ? " " : `of ${stats.totalTables} total`}</div>
            </div>
          )}

          <div className="stat-card">
            <div className="stat-label">
              <span
                style={{
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "50%",
                  background: "var(--success-light)",
                  color: "var(--success)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ClipboardList size={13} />
              </span>
              Today&apos;s Orders
            </div>
            <div className="stat-value">{statsLoading ? "—" : stats.todaysOrders}</div>
            <div className="stat-sub">placed today</div>
          </div>
        </div>

        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Quick Actions</h2>
        <div className="module-grid">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href} className="module-card">
                <div className="module-card-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="module-card-name">{item.label}</div>
                  <div className="module-card-desc">{item.description}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
