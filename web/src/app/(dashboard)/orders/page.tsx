"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Minus, AlertCircle, X, ChevronDown, ChevronRight, UtensilsCrossed } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import {
  ordersApi,
  tablesApi,
  menuApi,
  type Order,
  type OrderStatus,
  type OrderStatusHistoryEntry,
  type RestaurantTable,
  type MenuItem,
  type CreateOrderItemPayload,
} from "../../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const STATUS_OPTIONS: OrderStatus[] = [
  "OPEN",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
  "BILLED",
];

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  OPEN: "badge-blue",
  SENT_TO_KITCHEN: "badge-amber",
  PREPARING: "badge-amber",
  READY: "badge-green",
  SERVED: "badge-cyan",
  BILLED: "badge-gray",
  CANCELLED: "badge-red",
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

interface DraftLine {
  quantity: number;
  notes: string;
}

export default function OrdersPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<OrderStatusHistoryEntry[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");

  // Waiter's create-order panel state
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>([]);
  const [availableItems, setAvailableItems] = useState<MenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [draftLines, setDraftLines] = useState<Record<string, DraftLine>>({});
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && user?.role === "KITCHEN") {
      router.replace("/kitchen");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user && user.role !== "KITCHEN") {
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user?.role === "WAITER") {
      tablesApi.getAvailable().then(setAvailableTables).catch(() => undefined);
      menuApi.getAvailableItems().then(setAvailableItems).catch(() => undefined);
    }
  }, [user]);

  async function loadOrders(): Promise<void> {
    setLoadError(null);
    try {
      const data = await ordersApi.getAll();
      setOrders(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load orders");
    }
  }

  async function toggleExpand(order: Order): Promise<void> {
    if (expandedId === order.id) {
      setExpandedId(null);
      setHistory(null);
      return;
    }

    setExpandedId(order.id);
    setHistory(null);
    try {
      const data = await ordersApi.getHistory(order.id);
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }

  function openCreatePanel(): void {
    setSelectedTableId("");
    setDraftLines({});
    setActionError(null);
    setShowCreatePanel(true);
  }

  function closeCreatePanel(): void {
    setShowCreatePanel(false);
  }

  function setQuantity(menuItemId: string, quantity: number): void {
    setDraftLines((prev) => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[menuItemId];
      } else {
        next[menuItemId] = { quantity, notes: prev[menuItemId]?.notes ?? "" };
      }
      return next;
    });
  }

  function setNotes(menuItemId: string, notes: string): void {
    setDraftLines((prev) => ({
      ...prev,
      [menuItemId]: { quantity: prev[menuItemId]?.quantity ?? 1, notes },
    }));
  }

  async function handleCreateOrder(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsCreating(true);
    setActionError(null);
    try {
      const items: CreateOrderItemPayload[] = Object.entries(draftLines).map(([menuItemId, line]) => ({
        menuItemId,
        quantity: line.quantity,
        notes: line.notes || undefined,
      }));
      await ordersApi.create({ tableId: selectedTableId, items });
      closeCreatePanel();
      await loadOrders();
      tablesApi.getAvailable().then(setAvailableTables).catch(() => undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStatusChange(id: string, status: OrderStatus): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await ordersApi.updateStatus(id, status);
      await loadOrders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await ordersApi.cancel(id);
      await loadOrders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  if (user.role === "KITCHEN") {
    return null;
  }

  const visibleOrders = (orders ?? []).filter((order) => !statusFilter || order.status === statusFilter);
  const isManagerOrAdmin = user.role === "MANAGER" || user.role === "ADMIN";

  // Group available items by category name for the create-order panel.
  const itemsByCategory = availableItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const key = item.category?.name ?? "Other";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  const runningTotal = Object.entries(draftLines).reduce((sum, [menuItemId, line]) => {
    const item = availableItems.find((i) => i.id === menuItemId);
    return sum + (item ? Number(item.price) * line.quantity : 0);
  }, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{user.role === "WAITER" ? "My Orders" : "Orders"}</h1>
          <p className="page-subtitle">View and manage customer orders.</p>
        </div>
        <div className="flex items-center gap-3">
          {isManagerOrAdmin && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
              className="form-select"
              style={{ maxWidth: "180px" }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
          {user.role === "WAITER" && (
            <button type="button" className="btn btn-primary" onClick={openCreatePanel}>
              <Plus size={16} />
              Create Order
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {actionError && !showCreatePanel && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{actionError}</span>
          </div>
        )}
        {loadError && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{loadError}</span>
          </div>
        )}

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {!loadError && !orders && <p style={{ padding: "1.25rem" }}>Loading orders...</p>}
            {orders && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Table</th>
                      {isManagerOrAdmin && <th>Waiter</th>}
                      <th>Status</th>
                      <th>Items</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => {
                      const isExpanded = expandedId === order.id;
                      const isBusy = busyId === order.id;
                      const isOwnOrder = order.createdBy.id === user.id;

                      return (
                        <Fragment key={order.id}>
                          <tr>
                            <td>
                              <button
                                type="button"
                                onClick={() => void toggleExpand(order)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  color: "inherit",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  fontWeight: 600,
                                }}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                #{shortId(order.id)}
                              </button>
                            </td>
                            <td>Table {order.table.number}</td>
                            {isManagerOrAdmin && <td>{order.createdBy.fullName}</td>}
                            <td>
                              <span className={`badge ${STATUS_BADGE_CLASS[order.status]}`}>{order.status.replace(/_/g, " ")}</span>
                            </td>
                            <td>{order.items.length}</td>
                            <td>{new Date(order.createdAt).toLocaleString()}</td>
                            <td>
                              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                                {user.role === "WAITER" && isOwnOrder && order.status === "OPEN" && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={isBusy}
                                      onClick={() => void handleStatusChange(order.id, "SENT_TO_KITCHEN")}
                                    >
                                      Send to Kitchen
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      disabled={isBusy}
                                      onClick={() => void handleCancel(order.id)}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {user.role === "WAITER" && isOwnOrder && order.status === "READY" && (
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm"
                                    disabled={isBusy}
                                    onClick={() => void handleStatusChange(order.id, "SERVED")}
                                  >
                                    Mark Served
                                  </button>
                                )}
                                {user.role === "MANAGER" && order.status === "OPEN" && (
                                  <button type="button" className="btn btn-danger btn-sm" disabled={isBusy} onClick={() => void handleCancel(order.id)}>
                                    Cancel
                                  </button>
                                )}
                                {user.role === "CASHIER" && (order.status === "READY" || order.status === "SERVED") && (
                                  <Link href="/billing" className="btn btn-secondary btn-sm">
                                    Create Invoice
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={isManagerOrAdmin ? 7 : 6} style={{ background: "var(--bg)" }}>
                                <div style={{ padding: "0.5rem 0" }}>
                                  <strong style={{ fontSize: "0.8125rem" }}>Items</strong>
                                  <ul style={{ marginTop: "0.375rem", marginBottom: "0.875rem", paddingLeft: "1.25rem" }}>
                                    {order.items.map((item) => (
                                      <li key={item.id} style={{ fontSize: "0.8125rem" }}>
                                        {item.quantity}× {item.menuItem.name}
                                        {item.unitPrice ? ` - $${item.unitPrice}` : ""}
                                        {item.notes ? <span className="text-muted"> ({item.notes})</span> : ""}
                                      </li>
                                    ))}
                                  </ul>
                                  <strong style={{ fontSize: "0.8125rem" }}>Status history</strong>
                                  {history === null && <p className="text-muted text-sm">Loading...</p>}
                                  {history && history.length === 0 && <p className="text-muted text-sm">No history yet.</p>}
                                  {history && history.length > 0 && (
                                    <ul style={{ marginTop: "0.375rem", paddingLeft: "1.25rem" }}>
                                      {history.map((entry) => (
                                        <li key={entry.id} style={{ fontSize: "0.8125rem" }}>
                                          {entry.fromStatus.replace(/_/g, " ")} → {entry.toStatus.replace(/_/g, " ")} at{" "}
                                          {new Date(entry.changedAt).toLocaleString()}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {visibleOrders.length === 0 && (
                      <tr>
                        <td colSpan={isManagerOrAdmin ? 7 : 6}>
                          <div className="empty-state">No orders to show.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreatePanel && (
        <div className="panel-overlay" onClick={closeCreatePanel}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Create Order</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={closeCreatePanel} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateOrder} style={{ display: "contents" }}>
              <div className="panel-body">
                <div className="form-group">
                  <label className="form-label">Table</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                    {availableTables.map((table) => {
                      const selected = selectedTableId === table.id;
                      return (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => setSelectedTableId(table.id)}
                          style={{
                            padding: "0.625rem 0.5rem",
                            borderRadius: "var(--radius)",
                            border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
                            background: selected ? "var(--brand-light)" : "var(--surface)",
                            color: selected ? "var(--brand)" : "var(--text-primary)",
                            cursor: "pointer",
                            textAlign: "center",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                          }}
                        >
                          Table {table.number}
                        </button>
                      );
                    })}
                    {availableTables.length === 0 && <p className="text-muted text-sm">No available tables.</p>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Items</label>
                  {Object.entries(itemsByCategory).map(([categoryName, categoryItems]) => (
                    <div key={categoryName} style={{ marginBottom: "1rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.375rem" }}>
                        {categoryName}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {categoryItems.map((item) => {
                          const line = draftLines[item.id];
                          const quantity = line?.quantity ?? 0;
                          return (
                            <div key={item.id}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={`${API_URL}${item.imageUrl}`}
                                      alt={item.name}
                                      style={{
                                        width: "60px",
                                        height: "60px",
                                        objectFit: "cover",
                                        borderRadius: "var(--radius-sm)",
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: "60px",
                                        height: "60px",
                                        borderRadius: "var(--radius-sm)",
                                        background: "var(--bg)",
                                        border: "1px solid var(--border)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <UtensilsCrossed size={20} style={{ color: "var(--text-muted)" }} />
                                    </div>
                                  )}
                                  <div>
                                    <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{item.name}</div>
                                    <div className="text-muted text-sm">${item.price}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon btn-sm"
                                    onClick={() => setQuantity(item.id, Math.max(0, quantity - 1))}
                                    disabled={quantity === 0}
                                    aria-label={`Decrease ${item.name}`}
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span style={{ minWidth: "1.25rem", textAlign: "center", fontSize: "0.8125rem" }}>{quantity}</span>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon btn-sm"
                                    onClick={() => setQuantity(item.id, quantity + 1)}
                                    aria-label={`Increase ${item.name}`}
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              </div>
                              {quantity > 0 && (
                                <input
                                  type="text"
                                  placeholder="Notes (optional)"
                                  value={line?.notes ?? ""}
                                  onChange={(e) => setNotes(item.id, e.target.value)}
                                  className="form-input"
                                  style={{ marginTop: "0.375rem" }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {actionError && (
                  <div className="alert alert-danger">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
              <div className="panel-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
                <div className="flex justify-between font-semibold" style={{ fontSize: "0.9375rem" }}>
                  <span>Total</span>
                  <span>${runningTotal.toFixed(2)}</span>
                </div>
                <div className="flex gap-3" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeCreatePanel}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isCreating || Object.keys(draftLines).length === 0 || !selectedTableId}
                  >
                    {isCreating ? "Creating..." : "Submit Order"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
