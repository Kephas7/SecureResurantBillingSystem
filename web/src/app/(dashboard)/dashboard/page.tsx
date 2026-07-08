"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Grid3x3, DollarSign, RotateCcw } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { navItemsForRole } from "../../../lib/nav-items";
import { usersApi, tablesApi, reportsApi, billingApi } from "../../../lib/api";

interface DashboardStats {
  totalUsers: number | null;
  activeTables: number | null;
  todaysRevenue: string | null;
  pendingRefunds: number | null;
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
    totalUsers: null,
    activeTables: null,
    todaysRevenue: null,
    pendingRefunds: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const isAdmin = user?.role === "ADMIN";
  const isManagerOrAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    if (!user || !isManagerOrAdmin) {
      setStatsLoading(false);
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      // /users is ADMIN-only server-side - only ever requested as ADMIN,
      // never on behalf of a MANAGER (that call would 403 regardless).
      isAdmin ? usersApi.getAll() : Promise.resolve(null),
      tablesApi.getAll(),
      reportsApi.getSales(today, today),
      billingApi.getPendingRefunds(),
    ])
      .then(([users, tables, sales, pendingRefunds]) => {
        setStats({
          totalUsers: users ? users.length : null,
          activeTables: tables.filter((t) => t.status === "OCCUPIED").length,
          todaysRevenue: sales.totalRevenue,
          pendingRefunds: pendingRefunds.length,
        });
      })
      .catch(() => {
        // Stat cards are a convenience overview, not critical data - if
        // any of these fail, the page still renders with what it has.
      })
      .finally(() => setStatsLoading(false));
  }, [user, isAdmin, isManagerOrAdmin]);

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
        {isManagerOrAdmin && (
          <div className="stat-grid" style={{ marginBottom: "2rem" }}>
            {isAdmin && (
              <div className="stat-card">
                <div className="stat-label">
                  <Users size={14} />
                  Total Users
                </div>
                <div className="stat-value">{statsLoading ? "—" : stats.totalUsers}</div>
              </div>
            )}

            <div className="stat-card">
              <div className="stat-label">
                <Grid3x3 size={14} />
                Active Tables
              </div>
              <div className="stat-value">{statsLoading ? "—" : stats.activeTables}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <DollarSign size={14} />
                Today&apos;s Revenue
              </div>
              <div className="stat-value">
                {statsLoading ? "—" : `$${Number(stats.todaysRevenue ?? 0).toFixed(2)}`}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <RotateCcw size={14} />
                Pending Refunds
              </div>
              <div className="stat-value">{statsLoading ? "—" : stats.pendingRefunds}</div>
            </div>
          </div>
        )}

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
