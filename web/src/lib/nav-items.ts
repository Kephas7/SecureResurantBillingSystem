import {
  LayoutDashboard,
  Users,
  Shield,
  Grid3x3,
  BookOpen,
  ClipboardList,
  Receipt,
  Package,
  RotateCcw,
  BarChart3,
  ChefHat,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for "which feature is visible to which role" -
// shared by the dashboard's module-card grid and the sidebar nav so the
// two can't drift out of sync with each other. This is a UX convenience
// only: hiding an item here does not restrict access, it just avoids
// showing a link the API would reject anyway. RolesGuard on the API is
// the real enforcement layer.
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  /** One-line description shown on the dashboard's module card grid. */
  description?: string;
}

export const NAV_ITEMS: Record<string, NavItem> = {
  overview: {
    key: "overview",
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN"],
  },
  users: {
    key: "users",
    label: "Users",
    href: "/admin/users",
    icon: Users,
    roles: ["ADMIN"],
    description: "Staff accounts",
  },
  audit: {
    key: "audit",
    label: "Audit Logs",
    href: "/admin/audit",
    icon: Shield,
    roles: ["ADMIN"],
    description: "Security activity",
  },
  tables: {
    key: "tables",
    label: "Tables",
    href: "/tables",
    icon: Grid3x3,
    roles: ["ADMIN", "MANAGER", "WAITER"],
    description: "Manage dining tables",
  },
  menu: {
    key: "menu",
    label: "Menu",
    href: "/menu",
    icon: BookOpen,
    roles: ["ADMIN", "MANAGER"],
    description: "Items, categories & pricing",
  },
  orders: {
    key: "orders",
    label: "Orders",
    href: "/orders",
    icon: ClipboardList,
    roles: ["ADMIN", "MANAGER", "CASHIER", "WAITER"],
    description: "Customer orders & status",
  },
  billing: {
    key: "billing",
    label: "Billing",
    href: "/billing",
    icon: Receipt,
    roles: ["ADMIN", "CASHIER"],
    description: "Invoices & payments",
  },
  inventory: {
    key: "inventory",
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["ADMIN", "MANAGER"],
    description: "Stock levels & suppliers",
  },
  refunds: {
    key: "refunds",
    label: "Refunds",
    href: "/manager/refunds",
    icon: RotateCcw,
    roles: ["ADMIN", "MANAGER"],
  },
  reports: {
    key: "reports",
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["ADMIN", "MANAGER"],
    description: "Sales & analytics",
  },
  kitchen: {
    key: "kitchen",
    label: "Kitchen Queue",
    href: "/kitchen",
    icon: ChefHat,
    roles: ["KITCHEN"],
  },
};

export interface NavSection {
  /** null renders as an ungrouped section (no section heading) - used for "Overview". */
  label: string | null;
  items: NavItem[];
}

// Per-role section grouping/ordering for the sidebar. Item metadata
// (label/href/icon/roles) lives once in NAV_ITEMS above; this only
// controls how those items are grouped and labelled per role, since the
// same item (e.g. Orders) sits under a different section heading
// depending on who's looking at it ("Restaurant" for Admin/Manager vs
// "Operations" for Cashier/Waiter/Kitchen).
const ROLE_SECTIONS: Record<string, { label: string | null; keys: string[] }[]> = {
  ADMIN: [
    { label: null, keys: ["overview"] },
    { label: "Admin", keys: ["users", "audit"] },
    { label: "Restaurant", keys: ["tables", "menu", "orders", "billing", "inventory", "refunds", "reports"] },
  ],
  MANAGER: [
    { label: null, keys: ["overview"] },
    { label: "Restaurant", keys: ["tables", "menu", "orders", "inventory", "refunds", "reports"] },
  ],
  CASHIER: [
    { label: null, keys: ["overview"] },
    { label: "Operations", keys: ["orders", "billing"] },
  ],
  WAITER: [
    { label: null, keys: ["overview"] },
    { label: "Operations", keys: ["tables", "orders"] },
  ],
  KITCHEN: [
    { label: null, keys: ["overview"] },
    { label: "Operations", keys: ["kitchen"] },
  ],
};

export function navSectionsForRole(role: string): NavSection[] {
  const sections = ROLE_SECTIONS[role] ?? [];
  return sections.map((section) => ({
    label: section.label,
    items: section.keys.map((key) => NAV_ITEMS[key]).filter((item): item is NavItem => Boolean(item)),
  }));
}

// Flat, role-filtered list (excluding "Overview" itself) - used by the
// dashboard's module-card grid.
export function navItemsForRole(role: string): NavItem[] {
  return Object.values(NAV_ITEMS).filter((item) => item.key !== "overview" && item.roles.includes(role));
}
