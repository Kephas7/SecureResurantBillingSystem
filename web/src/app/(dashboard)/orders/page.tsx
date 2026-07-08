"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { ordersApi, type Order, type OrderStatus, type OrderStatusHistoryEntry } from "../../../lib/api";

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
            <Link href="/orders/new" className="btn btn-primary">
              <Plus size={16} />
              Create Order
            </Link>
          )}
        </div>
      </div>

      <div className="page-content">
        {actionError && (
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
    </>
  );
}
