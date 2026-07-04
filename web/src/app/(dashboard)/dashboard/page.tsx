"use client";

import Link from "next/link";
import { useAuth } from "../../../context/auth.context";
import { navItemsForRole } from "../../../lib/nav-items";

// Role-based UI rendering is a UX convenience only. Access control is
// enforced server-side via RolesGuard on every API endpoint (see
// api/src/common/guards/roles.guard.ts, which re-fetches the role from
// the DB rather than trusting the client). Hiding a card here does not
// prevent a technical user from calling the underlying API directly -
// that request would be rejected by RolesGuard regardless of what this
// page renders.
export default function DashboardPage(): JSX.Element {
  const { user } = useAuth();

  if (!user) {
    return <p>Loading...</p>;
  }

  const items = navItemsForRole(user.role);

  return (
    <div>
      <h1>Welcome, {user.fullName}</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>Role: {user.role}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
        {items.map((item) =>
          item.comingSoon ? (
            <div key={item.label} className="card" style={{ opacity: 0.6 }}>
              <h3>{item.label}</h3>
              <p style={{ color: "var(--color-text-muted)" }}>Coming soon</p>
            </div>
          ) : (
            <Link key={item.label} href={item.href} className="card" style={{ display: "block" }}>
              <h3>{item.label}</h3>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
