"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const STATUS_OPTIONS: OrderStatus[] = [
  "OPEN",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
  "BILLED",
];

function shortId(id: string): string {
  return id.slice(0, 8);
}

interface DraftLine {
  menuItemId: string;
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

  // Waiter's create-order form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>([]);
  const [availableItems, setAvailableItems] = useState<MenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
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

  function addDraftLine(): void {
    if (availableItems.length === 0) return;
    setDraftLines([...draftLines, { menuItemId: availableItems[0].id, quantity: 1, notes: "" }]);
  }

  function updateDraftLine(index: number, patch: Partial<DraftLine>): void {
    setDraftLines(draftLines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeDraftLine(index: number): void {
    setDraftLines(draftLines.filter((_, i) => i !== index));
  }

  async function handleCreateOrder(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsCreating(true);
    setActionError(null);
    try {
      const items: CreateOrderItemPayload[] = draftLines.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        notes: line.notes || undefined,
      }));
      await ordersApi.create({ tableId: selectedTableId, items });
      setShowCreateForm(false);
      setSelectedTableId("");
      setDraftLines([]);
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1>{user.role === "WAITER" ? "My Orders" : "Orders"}</h1>
        {user.role === "WAITER" && (
          <button type="button" onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? "Cancel" : "Create Order"}
          </button>
        )}
      </div>

      {(user.role === "MANAGER" || user.role === "ADMIN") && (
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="status-filter">Filter by status</label>
          <br />
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      )}

      {showCreateForm && user.role === "WAITER" && (
        <form
          onSubmit={handleCreateOrder}
          className="card"
          style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "32rem" }}
        >
          <div>
            <label htmlFor="order-table">Table</label>
            <select
              id="order-table"
              required
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select a table</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  Table {table.number} (seats {table.capacity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Items</label>
              <button type="button" onClick={addDraftLine}>
                Add Item
              </button>
            </div>

            {draftLines.map((line, index) => (
              <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                <select
                  value={line.menuItemId}
                  onChange={(e) => updateDraftLine(index, { menuItemId: e.target.value })}
                  style={{ flex: 2 }}
                >
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.category?.name ? `[${item.category.name}] ` : ""}
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={line.quantity}
                  onChange={(e) => updateDraftLine(index, { quantity: Number(e.target.value) })}
                  style={{ width: "4rem" }}
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={line.notes}
                  onChange={(e) => updateDraftLine(index, { notes: e.target.value })}
                  style={{ flex: 2 }}
                />
                <button type="button" onClick={() => removeDraftLine(index)}>
                  Remove
                </button>
              </div>
            ))}

            {draftLines.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>No items added yet.</p>
            )}
          </div>

          {actionError && <p className="error-msg">{actionError}</p>}

          <button type="submit" disabled={isCreating || draftLines.length === 0 || !selectedTableId}>
            {isCreating ? "Creating..." : "Submit Order"}
          </button>
        </form>
      )}

      {!showCreateForm && actionError && <p className="error-msg" style={{ marginBottom: "1rem" }}>{actionError}</p>}
      {loadError && <p className="error-msg">{loadError}</p>}
      {!loadError && !orders && <p>Loading orders...</p>}

      {orders && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Order</th>
                <th style={{ padding: "0.5rem" }}>Table</th>
                {(user.role === "MANAGER" || user.role === "ADMIN") && <th style={{ padding: "0.5rem" }}>Waiter</th>}
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Items</th>
                <th style={{ padding: "0.5rem" }}>Created</th>
                <th style={{ padding: "0.5rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => {
                const isExpanded = expandedId === order.id;
                const isBusy = busyId === order.id;
                const isOwnOrder = order.createdBy.id === user.id;

                return (
                  <Fragment key={order.id}>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem" }}>
                        <button type="button" onClick={() => void toggleExpand(order)} style={{ background: "none", color: "inherit", padding: 0 }}>
                          {isExpanded ? "▾" : "▸"} #{shortId(order.id)}
                        </button>
                      </td>
                      <td style={{ padding: "0.5rem" }}>Table {order.table.number}</td>
                      {(user.role === "MANAGER" || user.role === "ADMIN") && (
                        <td style={{ padding: "0.5rem" }}>{order.createdBy.fullName}</td>
                      )}
                      <td style={{ padding: "0.5rem" }}>{order.status}</td>
                      <td style={{ padding: "0.5rem" }}>{order.items.length}</td>
                      <td style={{ padding: "0.5rem" }}>{new Date(order.createdAt).toLocaleString()}</td>
                      <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {user.role === "WAITER" && isOwnOrder && order.status === "OPEN" && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(order.id, "SENT_TO_KITCHEN")}
                            >
                              Send to Kitchen
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => void handleCancel(order.id)}>
                              Cancel
                            </button>
                          </>
                        )}
                        {user.role === "WAITER" && isOwnOrder && order.status === "READY" && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleStatusChange(order.id, "SERVED")}
                          >
                            Mark Served
                          </button>
                        )}
                        {user.role === "MANAGER" && order.status === "OPEN" && (
                          <button type="button" disabled={isBusy} onClick={() => void handleCancel(order.id)}>
                            Cancel
                          </button>
                        )}
                        {user.role === "CASHIER" && (order.status === "READY" || order.status === "SERVED") && (
                          <Link href="/billing">Create Invoice</Link>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: "0.75rem", backgroundColor: "var(--color-bg)" }}>
                          <strong>Items</strong>
                          <ul style={{ marginTop: "0.25rem", marginBottom: "0.75rem", paddingLeft: "1.25rem" }}>
                            {order.items.map((item) => (
                              <li key={item.id}>
                                {item.quantity}x {item.menuItem.name}
                                {item.unitPrice ? ` - $${item.unitPrice}` : ""}
                                {item.notes ? ` (${item.notes})` : ""}
                              </li>
                            ))}
                          </ul>
                          <strong>Status history</strong>
                          {history === null && <p>Loading...</p>}
                          {history && history.length === 0 && <p>No history yet.</p>}
                          {history && history.length > 0 && (
                            <ul style={{ marginTop: "0.25rem", paddingLeft: "1.25rem" }}>
                              {history.map((entry) => (
                                <li key={entry.id}>
                                  {entry.fromStatus} → {entry.toStatus} at{" "}
                                  {new Date(entry.changedAt).toLocaleString()}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                    No orders to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
