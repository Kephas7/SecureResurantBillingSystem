"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { ordersApi, type Order } from "../../../lib/api";

const REFRESH_INTERVAL_MS = 30000;

function minutesElapsed(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

function timeColour(minutes: number): string {
  if (minutes > 20) return "var(--danger)";
  if (minutes >= 10) return "var(--warning)";
  return "var(--success)";
}

function OrderCard({ order, onAdvance, busy }: { order: Order; onAdvance: () => void; busy: boolean }): JSX.Element {
  const minutes = minutesElapsed(order.createdAt);

  return (
    <div className="kitchen-card">
      <div className="kitchen-card-header">
        <span className="kitchen-card-table">Table {order.table.number}</span>
        <span className="kitchen-card-time" style={{ color: timeColour(minutes), fontWeight: 600 }}>
          {timeAgo(minutes)}
        </span>
      </div>

      {/* Kitchen staff must not see prices - least-privilege data
          minimisation (GDPR data minimisation principle). The API
          itself omits unitPrice/menuItem.price for the KITCHEN role
          (see OrdersService.toResponse), so there is nothing price-
          related to even accidentally render here. */}
      <div className="kitchen-items">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className="kitchen-item">
              <span>
                {item.quantity}× {item.menuItem.name}
              </span>
            </div>
            {item.notes && <div className="kitchen-item-notes">{item.notes}</div>}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onAdvance}
        className={`btn w-full ${order.status === "SENT_TO_KITCHEN" ? "btn-primary" : "btn-success"}`}
        style={{ justifyContent: "center" }}
      >
        {busy ? "Updating..." : order.status === "SENT_TO_KITCHEN" ? "Start Preparing" : "Mark Ready"}
      </button>
    </div>
  );
}

function EmptyColumn(): JSX.Element {
  return (
    <div className="empty-state">
      <CheckCircle size={32} />
      <p>All clear</p>
    </div>
  );
}

export default function KitchenQueuePage(): JSX.Element {
  const { isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadOrders = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await ordersApi.getAll();
      setOrders(data);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kitchen queue");
    } finally {
      setIsRefreshing(false);
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
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Kitchen Queue</h1>
          <p className="page-subtitle">
            {lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : "Loading..."}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadOrders()} disabled={isRefreshing}>
          <RefreshCw size={16} className={isRefreshing ? "spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="page-content">
        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{error}</span>
          </div>
        )}
        {!error && !orders && <p>Loading...</p>}

        {orders && (
          <div className="kanban">
            <div>
              <div className="kanban-col-header">
                <span className="kanban-col-title">Incoming</span>
                <span className="badge badge-amber">{incoming.length}</span>
              </div>
              <div className="kanban-cards">
                {incoming.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    busy={busyId === order.id}
                    onAdvance={() => void handleAdvance(order)}
                  />
                ))}
                {incoming.length === 0 && <EmptyColumn />}
              </div>
            </div>

            <div>
              <div className="kanban-col-header">
                <span className="kanban-col-title">Preparing</span>
                <span className="badge badge-blue">{preparing.length}</span>
              </div>
              <div className="kanban-cards">
                {preparing.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    busy={busyId === order.id}
                    onAdvance={() => void handleAdvance(order)}
                  />
                ))}
                {preparing.length === 0 && <EmptyColumn />}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
