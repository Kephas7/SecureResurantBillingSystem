// Single source of truth for "which feature is visible to which role,
// and is it built yet" - shared by the dashboard's placeholder cards and
// the dashboard layout's nav bar so the two can't drift out of sync with
// each other. This is a UX convenience only: hiding an item here does not
// restrict access, it just avoids showing a link the API would reject
// anyway. RolesGuard on the API is the real enforcement layer.
export interface NavItem {
  label: string;
  href: string;
  roles: string[];
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Users", href: "/admin/users", roles: ["ADMIN"] },
  { label: "Audit Logs", href: "/admin/audit", roles: ["ADMIN"] },
  { label: "Tables", href: "/tables", roles: ["ADMIN", "MANAGER", "WAITER"] },
  { label: "Menu", href: "/menu", roles: ["ADMIN", "MANAGER"] },
  { label: "Orders", href: "/orders", roles: ["ADMIN", "MANAGER", "CASHIER", "WAITER"] },
  { label: "Kitchen Queue", href: "/kitchen", roles: ["KITCHEN"] },
  { label: "Billing", href: "/billing", roles: ["ADMIN", "CASHIER"] },
  { label: "Inventory", href: "/inventory", roles: ["ADMIN", "MANAGER"] },
  { label: "Refunds", href: "/manager/refunds", roles: ["ADMIN", "MANAGER"] },
  { label: "Reports", href: "/reports", roles: ["MANAGER"], comingSoon: true },
];

export function navItemsForRole(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
