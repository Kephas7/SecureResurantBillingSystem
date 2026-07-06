"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth.context";
import { ordersApi, type Order } from "../../../lib/api";

const REFRESH_INTERVAL_MS = 30000;

function timeAgo(isoDate: string): string {
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

function OrderCard({ order, onAdvance, busy }: { order: Order; onAdvance: () => void; busy: boolean }): JSX.Element {
  return (
    <div className="card">
      <h3>Table {order.table.number}</h3>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>{timeAgo(order.createdAt)}</p>

      {/* Kitchen staff must not see prices - least-privilege data
          minimisation (GDPR data minimisation principle). The API
          itself omits unitPrice/menuItem.price for the KITCHEN role
          (see OrdersService.toResponse), so there is nothing price-
          related to even accidentally render here. */}
      <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.menuItem.name}
            {item.notes ? ` - ${item.notes}` : ""}
          </li>
        ))}
      </ul>

      <button type="button" disabled={busy} onClick={onAdvance} style={{ marginTop: "0.75rem", width: "100%" }}>
        {order.status === "SENT_TO_KITCHEN" ? "Start Preparing" : "Mark Ready"}
      </button>
    </div>
  );
}

export default function KitchenQueuePage(): JSX.Element {
  const { isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await ordersApi.getAll();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kitchen queue");
    }
  }, []);

  useEffect(() => {
    void loadOrders();

    // Auto-refresh every 30 seconds is a simple polling approach. In
    // production this would use WebSockets or Server-Sent Events for
    // real-time updates. For this coursework, polling is sufficient and
    // avoids the additional complexity of a WebSocket server.
    const interval = setInterval(() => void loadOrders(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function handleAdvance(order: Order): Promise<void> {
    setBusyId(order.id);
    setError(null);
    try {
      const nextStatus = order.status === "SENT_TO_KITCHEN" ? "PREPARING" : "READY";
      await ordersApi.updateStatus(order.id, nextStatus);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <p>Loading...</p>;
  }

  const incoming = (orders ?? []).filter((order) => order.status === "SENT_TO_KITCHEN");
  const preparing = (orders ?? []).filter((order) => order.status === "PREPARING");

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Kitchen Queue</h1>

      {error && <p className="error-msg">{error}</p>}
      {!error && !orders && <p>Loading...</p>}

      {orders && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div>
            <h2 style={{ marginBottom: "1rem" }}>Incoming ({incoming.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {incoming.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={busyId === order.id}
                  onAdvance={() => void handleAdvance(order)}
                />
              ))}
              {incoming.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nothing incoming.</p>}
            </div>
          </div>

          <div>
            <h2 style={{ marginBottom: "1rem" }}>Preparing ({preparing.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {preparing.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={busyId === order.id}
                  onAdvance={() => void handleAdvance(order)}
                />
              ))}
              {preparing.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nothing preparing.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
