// Role checks in this file are client-side UX helpers only. Every role
// decision that matters is enforced server-side by RolesGuard and
// ownership checks in the service layer - these functions only decide
// what to render, never what to allow.
export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export function hasRole(userRole: string, ...roles: Role[]): boolean {
  return roles.includes(userRole as Role);
}

export function canManageOrders(role: string): boolean {
  return hasRole(role, "ADMIN", "MANAGER", "WAITER", "CASHIER");
}

export function canCreateOrders(role: string): boolean {
  return hasRole(role, "WAITER");
}

export function canViewKitchenQueue(role: string): boolean {
  return hasRole(role, "KITCHEN", "MANAGER", "ADMIN");
}

// Presentation-only mapping from role -> badge colour class, shared by
// the sidebar's user badge and the user management table so the same
// role always reads the same colour everywhere in the app.
const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: "badge-purple",
  MANAGER: "badge-blue",
  CASHIER: "badge-cyan",
  WAITER: "badge-green",
  KITCHEN: "badge-amber",
};

export function roleBadgeClass(role: string): string {
  return ROLE_BADGE_CLASSES[role] ?? "badge-gray";
}
