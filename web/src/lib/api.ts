import axios, { AxiosError } from "axios";

// withCredentials: true is required for the session cookie to be sent
// cross-origin (the web app on :3000 calling the API on :4000). Without
// this the browser strips the cookie from every request and the user
// appears logged out on every API call, even immediately after login.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// Pages reachable before a full (session + MFA-verified) auth state exists.
// A 401 on one of these is an expected part of the flow (e.g. a user who
// is logged in but hasn't completed MFA yet gets 401 from most endpoints
// until they verify) - redirecting away from them would break the exact
// flows they exist for.
const PUBLIC_PATHS = ["/login", "/mfa-verify", "/forgot-password", "/reset-password"];

// SessionGuard (api/src/common/guards/session.guard.ts) enforces password
// expiry server-side by throwing a 403 whose message body is this JSON
// shape, rather than a plain string - GlobalExceptionFilter passes an
// HttpException's message through unmodified, so it arrives here still
// JSON-encoded and must be parsed back out.
interface StructuredErrorBody {
  code: string;
  message: string;
}

function parseStructuredError(message: string | undefined): StructuredErrorBody | null {
  if (!message) return null;
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed && typeof parsed === "object" && "code" in parsed && "message" in parsed) {
      return parsed as StructuredErrorBody;
    }
  } catch {
    // Not a structured error - a normal string message, handled below.
  }
  return null;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const isPublicPath =
      typeof window !== "undefined" && PUBLIC_PATHS.includes(window.location.pathname);

    const structured = parseStructuredError(error.response?.data?.message);

    if (
      error.response?.status === 403 &&
      structured?.code === "PASSWORD_EXPIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/password-expired"
    ) {
      window.location.href = "/password-expired";
      return Promise.reject(new Error(structured.message));
    }

    if (error.response?.status === 401 && !isPublicPath) {
      window.location.href = "/login";
    }

    const message = structured?.message ?? error.response?.data?.message ?? GENERIC_ERROR_MESSAGE;
    return Promise.reject(new Error(message));
  },
);

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mfaEnabled: boolean;
  passwordExpired: boolean;
  passwordChangedAt: string;
}

interface LoginResponse {
  message: string;
  requiresMfa: boolean;
  role: string;
}

export const authApi = {
  login: (email: string, password: string, captchaToken?: string) =>
    apiClient
      .post<LoginResponse>("/auth/login", { email, password, captchaToken })
      .then((res) => res.data),

  logout: () => apiClient.post<{ message: string }>("/auth/logout").then((res) => res.data),

  me: () => apiClient.get<MeResponse>("/auth/me").then((res) => res.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>("/auth/change-password", { currentPassword, newPassword })
      .then((res) => res.data),

  setupMfa: () =>
    apiClient
      .post<{ otpauthUrl: string; qrCodeDataUrl: string }>("/auth/mfa/setup")
      .then((res) => res.data),

  verifyMfaSetup: (token: string, secret: string) =>
    apiClient
      .post<{ message: string }>("/auth/mfa/verify-setup", { token, secret })
      .then((res) => res.data),

  verifyMfa: (token: string) =>
    apiClient.post<{ message: string }>("/auth/mfa/verify", { token }).then((res) => res.data),

  requestPasswordReset: (email: string) =>
    apiClient
      .post<{ message: string }>("/auth/request-password-reset", { email })
      .then((res) => res.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>("/auth/reset-password", { token, newPassword })
      .then((res) => res.data),
};

export const profileApi = {
  get: () => apiClient.get<MeResponse>("/auth/profile").then((res) => res.data),

  update: (data: { fullName: string }) =>
    apiClient.patch<MeResponse>("/auth/profile", data).then((res) => res.data),
};

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: string;
  mfaEnabled: boolean;
  createdAt: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  roleName: string;
}

export interface UpdateUserPayload {
  fullName?: string;
  roleName?: string;
  isActive?: boolean;
}

export const usersApi = {
  getAll: () => apiClient.get<AdminUser[]>("/users").then((res) => res.data),

  create: (data: CreateUserPayload) => apiClient.post<AdminUser>("/users", data).then((res) => res.data),

  update: (id: string, data: UpdateUserPayload) =>
    apiClient.patch<AdminUser>(`/users/${id}`, data).then((res) => res.data),

  deactivate: (id: string) => apiClient.delete(`/users/${id}`).then((res) => res.data),

  unlock: (id: string) => apiClient.post<{ message: string }>(`/users/${id}/unlock`).then((res) => res.data),
};

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "OUT_OF_SERVICE";

export interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  status: TableStatus;
}

export interface CreateTablePayload {
  number: number;
  capacity: number;
}

export interface UpdateTablePayload {
  number?: number;
  capacity?: number;
  status?: TableStatus;
}

export interface TableAssignment {
  id: string;
  tableId: string;
  waiterId: string;
  assignedAt: string;
  releasedAt: string | null;
}

export const tablesApi = {
  getAll: () => apiClient.get<RestaurantTable[]>("/tables").then((res) => res.data),

  getAvailable: () => apiClient.get<RestaurantTable[]>("/tables/available").then((res) => res.data),

  create: (data: CreateTablePayload) => apiClient.post<RestaurantTable>("/tables", data).then((res) => res.data),

  update: (id: string, data: UpdateTablePayload) =>
    apiClient.patch<RestaurantTable>(`/tables/${id}`, data).then((res) => res.data),

  delete: (id: string) => apiClient.delete(`/tables/${id}`).then((res) => res.data),

  assign: (id: string, waiterId: string) =>
    apiClient.post<TableAssignment>(`/tables/${id}/assign`, { waiterId }).then((res) => res.data),

  release: (id: string) =>
    apiClient.post<{ message: string }>(`/tables/${id}/release`).then((res) => res.data),

  getAssignment: (id: string) =>
    apiClient.get<TableAssignment | null>(`/tables/${id}/assignment`).then((res) => res.data),
};

export interface MenuCategory {
  id: string;
  name: string;
  _count?: { items: number };
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
  categoryId: string;
  category?: { name: string };
  // Relative path (e.g. "/uploads/<uuid>.jpg") returned by the upload
  // endpoint - the full URL is constructed by prepending
  // NEXT_PUBLIC_API_URL wherever this is rendered. null = no image.
  imageUrl?: string | null;
}

export interface CreateCategoryPayload {
  name: string;
}

export interface CreateMenuItemPayload {
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  isAvailable?: boolean;
  imageUrl?: string;
}

export const menuApi = {
  getCategories: () => apiClient.get<MenuCategory[]>("/menu/categories").then((res) => res.data),

  createCategory: (data: CreateCategoryPayload) =>
    apiClient.post<MenuCategory>("/menu/categories", data).then((res) => res.data),

  updateCategory: (id: string, data: Partial<CreateCategoryPayload>) =>
    apiClient.patch<MenuCategory>(`/menu/categories/${id}`, data).then((res) => res.data),

  deleteCategory: (id: string) => apiClient.delete(`/menu/categories/${id}`).then((res) => res.data),

  getItems: () => apiClient.get<MenuItem[]>("/menu/items").then((res) => res.data),

  getAvailableItems: () => apiClient.get<MenuItem[]>("/menu/items/available").then((res) => res.data),

  createItem: (data: CreateMenuItemPayload) => apiClient.post<MenuItem>("/menu/items", data).then((res) => res.data),

  updateItem: (id: string, data: Partial<CreateMenuItemPayload>) =>
    apiClient.patch<MenuItem>(`/menu/items/${id}`, data).then((res) => res.data),

  toggleItem: (id: string) => apiClient.patch<MenuItem>(`/menu/items/${id}/toggle`).then((res) => res.data),

  deleteItem: (id: string) => apiClient.delete(`/menu/items/${id}`).then((res) => res.data),

  uploadMenuItemImage: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    // The apiClient instance defaults every request to
    // Content-Type: application/json - explicitly unsetting it here
    // lets axios detect the FormData body itself and set the correct
    // multipart/form-data header with its auto-generated boundary.
    // Setting it manually to "multipart/form-data" without a boundary
    // (or leaving the default json header in place) would produce a
    // body the server's multipart parser cannot read.
    return apiClient
      .post<{ imageUrl: string }>("/upload/menu-item-image", formData, {
        headers: { "Content-Type": undefined },
      })
      .then((res) => res.data);
  },

  deleteMenuItemImage: (filename: string) =>
    apiClient.delete<void>(`/upload/menu-item-image/${filename}`).then((res) => res.data),
};

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
  actorEmail: string | null;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const auditApi = {
  getLogs: (params: {
    page?: number;
    limit?: number;
    action?: string;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) =>
    apiClient.get<PaginatedAuditLogs>("/audit/logs", { params }).then((res) => res.data),

  getActions: () => apiClient.get<string[]>("/audit/logs/actions").then((res) => res.data),
};

export type OrderStatus =
  | "OPEN"
  | "SENT_TO_KITCHEN"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "CANCELLED"
  | "BILLED";

export interface OrderItemResponse {
  id: string;
  quantity: number;
  notes: string | null;
  unitPrice?: string;
  menuItem: { id: string; name: string; price?: string };
}

export interface Order {
  id: string;
  tableId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  table: RestaurantTable;
  createdBy: { id: string; fullName: string; email: string };
  items: OrderItemResponse[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedAt: string;
  changedById: string | null;
}

export interface CreateOrderItemPayload {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderPayload {
  tableId: string;
  items: CreateOrderItemPayload[];
}

export const ordersApi = {
  getAll: () => apiClient.get<Order[]>("/orders").then((res) => res.data),

  getOne: (id: string) => apiClient.get<Order>(`/orders/${id}`).then((res) => res.data),

  create: (data: CreateOrderPayload) => apiClient.post<Order>("/orders", data).then((res) => res.data),

  updateItems: (id: string, data: { items: CreateOrderItemPayload[] }) =>
    apiClient.patch<Order>(`/orders/${id}/items`, data).then((res) => res.data),

  updateStatus: (id: string, status: OrderStatus) =>
    apiClient.patch<Order>(`/orders/${id}/status`, { status }).then((res) => res.data),

  cancel: (id: string) => apiClient.delete<Order>(`/orders/${id}`).then((res) => res.data),

  getHistory: (id: string) =>
    apiClient.get<OrderStatusHistoryEntry[]>(`/orders/${id}/history`).then((res) => res.data),
};

export type PaymentMethod = "CASH" | "CARD" | "MOBILE" | "STRIPE";
export type InvoiceStatus = "UNPAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOID";
export type RefundStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  status: InvoiceStatus;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  order: Order;
  createdBy: { id: string; fullName: string; email: string };
  refundRequests: RefundRequest[];
}

export interface RefundRequest {
  id: string;
  invoiceId: string;
  requestedById: string;
  reason: string;
  amount: string;
  status: RefundStatus;
  approvedById: string | null;
  createdAt: string;
  decidedAt: string | null;
  invoice?: { id: string; invoiceNumber: string; totalAmount: string };
}

export interface PaginatedInvoices {
  data: Invoice[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateInvoicePayload {
  orderId: string;
  paymentMethod: PaymentMethod;
  discountAmount?: number;
}

export const billingApi = {
  getInvoices: (page = 1, limit = 20) =>
    apiClient.get<PaginatedInvoices>("/billing/invoices", { params: { page, limit } }).then((res) => res.data),

  getInvoice: (id: string) => apiClient.get<Invoice>(`/billing/invoices/${id}`).then((res) => res.data),

  getInvoiceByOrder: (orderId: string) =>
    apiClient.get<Invoice>(`/billing/invoices/order/${orderId}`).then((res) => res.data),

  createInvoice: (data: CreateInvoicePayload) =>
    apiClient.post<Invoice>("/billing/invoices", data).then((res) => res.data),

  confirmPayment: (id: string) => apiClient.post<Invoice>(`/billing/invoices/${id}/confirm`).then((res) => res.data),

  // Returns a Stripe PaymentIntent clientSecret - never the invoice's
  // paid status directly. The invoice only becomes PAID once Stripe's
  // webhook confirms the charge server-side (see billing.controller.ts
  // POST /billing/webhooks/stripe).
  createPaymentIntent: (id: string) =>
    apiClient.post<{ clientSecret: string }>(`/billing/invoices/${id}/create-payment-intent`).then((res) => res.data),

  requestRefund: (id: string, data: { amount: number; reason: string }) =>
    apiClient.post<RefundRequest>(`/billing/invoices/${id}/refund`, data).then((res) => res.data),

  getPendingRefunds: () =>
    apiClient.get<RefundRequest[]>("/billing/refunds/pending").then((res) => res.data),

  getDecidedRefunds: (limit = 20) =>
    apiClient.get<RefundRequest[]>("/billing/refunds/decided", { params: { limit } }).then((res) => res.data),

  approveRefund: (refundId: string) =>
    apiClient.post<{ message: string }>(`/billing/refunds/${refundId}/approve`).then((res) => res.data),

  rejectRefund: (refundId: string) =>
    apiClient.post<{ message: string }>(`/billing/refunds/${refundId}/reject`).then((res) => res.data),
};

export interface Supplier {
  id: string;
  name: string;
  contactInfo: string | null;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQuantity: string;
  lowStockThreshold: string;
  supplierId: string | null;
  supplier?: { id: string; name: string } | null;
}

export interface CreateIngredientPayload {
  name: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  supplierId?: string;
}

export interface AdjustStockPayload {
  adjustment: number;
  reason: string;
}

export interface CreateSupplierPayload {
  name: string;
  contactInfo?: string;
}

export const inventoryApi = {
  getIngredients: () => apiClient.get<Ingredient[]>("/inventory/ingredients").then((res) => res.data),

  getLowStock: () => apiClient.get<Ingredient[]>("/inventory/ingredients/low-stock").then((res) => res.data),

  createIngredient: (data: CreateIngredientPayload) =>
    apiClient.post<Ingredient>("/inventory/ingredients", data).then((res) => res.data),

  updateIngredient: (id: string, data: Partial<CreateIngredientPayload>) =>
    apiClient.patch<Ingredient>(`/inventory/ingredients/${id}`, data).then((res) => res.data),

  adjustStock: (id: string, data: AdjustStockPayload) =>
    apiClient.post<Ingredient>(`/inventory/ingredients/${id}/adjust`, data).then((res) => res.data),

  getSuppliers: () => apiClient.get<Supplier[]>("/inventory/suppliers").then((res) => res.data),

  createSupplier: (data: CreateSupplierPayload) =>
    apiClient.post<Supplier>("/inventory/suppliers", data).then((res) => res.data),

  updateSupplier: (id: string, data: Partial<CreateSupplierPayload>) =>
    apiClient.patch<Supplier>(`/inventory/suppliers/${id}`, data).then((res) => res.data),
};

export interface RevenueByDay {
  date: string;
  revenue: string;
}

export interface TopMenuItem {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenueContribution: string;
}

export interface SalesReport {
  totalRevenue: string;
  totalInvoices: number;
  totalOrders: number;
  averageOrderValue: string;
  revenueByDay: RevenueByDay[];
  topMenuItems: TopMenuItem[];
  paymentMethodBreakdown: Record<string, number>;
}

export interface InventoryReport {
  totalIngredients: number;
  lowStockItems: Ingredient[];
  outOfStockItems: Ingredient[];
}

export interface WaiterStats {
  waiterId: string;
  waiterName: string;
  orderCount: number;
  totalRevenue: string;
}

export interface StaffReport {
  ordersPerWaiter: WaiterStats[];
}

export interface RefundsByReason {
  reason: string;
  count: number;
}

export interface RefundReport {
  totalRefunds: number;
  totalRefundAmount: string;
  refundsByReason: RefundsByReason[];
  pendingRefunds: number;
}

export const reportsApi = {
  getSales: (startDate: string, endDate: string) =>
    apiClient.get<SalesReport>("/reports/sales", { params: { startDate, endDate } }).then((res) => res.data),

  getInventory: () => apiClient.get<InventoryReport>("/reports/inventory").then((res) => res.data),

  getStaff: (startDate: string, endDate: string) =>
    apiClient.get<StaffReport>("/reports/staff", { params: { startDate, endDate } }).then((res) => res.data),

  getRefunds: (startDate: string, endDate: string) =>
    apiClient.get<RefundReport>("/reports/refunds", { params: { startDate, endDate } }).then((res) => res.data),
};
