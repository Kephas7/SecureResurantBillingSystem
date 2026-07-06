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
