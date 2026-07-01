"use client";

import { useAuth } from "../../../context/auth.context";

const ROLE_CARDS: Record<string, string[]> = {
  ADMIN: ["Users", "Logs"],
  MANAGER: ["Orders", "Inventory", "Reports", "Refunds"],
  CASHIER: ["Orders", "Billing"],
  WAITER: ["Orders", "Tables"],
  KITCHEN: ["Kitchen Queue"],
};

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

  const cards = ROLE_CARDS[user.role] ?? [];

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
        {cards.map((name) => (
          <div key={name} className="card">
            <h3>{name}</h3>
            <p style={{ color: "var(--color-text-muted)" }}>Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
