"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth.context";
import {
  billingApi,
  ordersApi,
  type Order,
  type Invoice,
  type PaymentMethod,
  type PaginatedInvoices,
} from "../../../lib/api";

// Display-only estimate to preview the total before submission. The
// authoritative calculation (including the real TAX_RATE from env) is
// always done server-side in BillingService.createInvoice - this is
// just so the cashier isn't surprised by the confirmed total.
const DISPLAY_TAX_RATE = 0.13;

const STATUS_COLOURS: Record<string, string> = {
  UNPAID: "var(--color-warning)",
  PAID: "var(--color-success)",
  REFUNDED: "var(--color-danger)",
  PARTIALLY_REFUNDED: "var(--color-danger)",
  VOID: "var(--color-text-muted)",
};

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

export default function BillingPage(): JSX.Element {
  const { isLoading: authLoading } = useAuth();

  const [billableOrders, setBillableOrders] = useState<Order[] | null>(null);
  const [invoices, setInvoices] = useState<PaginatedInvoices | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [invoiceFormOrderId, setInvoiceFormOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountInput, setDiscountInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [refundModalInvoice, setRefundModalInvoice] = useState<Invoice | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadAll(): Promise<void> {
    setLoadError(null);
    try {
      const [orders, invoiceList] = await Promise.all([ordersApi.getAll(), billingApi.getInvoices(page, 20)]);
      setBillableOrders(orders.filter((o) => o.status === "READY" || o.status === "SERVED"));
      setInvoices(invoiceList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load billing data");
    }
  }

  function openInvoiceForm(orderId: string): void {
    setInvoiceFormOrderId(orderId);
    setPaymentMethod("CASH");
    setDiscountInput("");
    setActionError(null);
  }

  function computeTotals(order: Order, discount: number): { subtotal: number; tax: number; total: number } {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * item.quantity, 0);
    const tax = subtotal * DISPLAY_TAX_RATE;
    const total = subtotal + tax - discount;
    return { subtotal, tax, total };
  }

  async function handleCreateInvoice(e: React.FormEvent, order: Order): Promise<void> {
    e.preventDefault();
    setIsCreating(true);
    setActionError(null);
    try {
      await billingApi.createInvoice({
        orderId: order.id,
        paymentMethod,
        discountAmount: discountInput ? Number(discountInput) : undefined,
      });
      setInvoiceFormOrderId(null);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmPayment(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await billingApi.confirmPayment(id);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to confirm payment");
    } finally {
      setBusyId(null);
    }
  }

  function openRefundModal(invoice: Invoice): void {
    setRefundModalInvoice(invoice);
    setRefundAmount(invoice.totalAmount);
    setRefundReason("");
    setActionError(null);
  }

  async function handleRequestRefund(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!refundModalInvoice) return;

    setIsRefunding(true);
    setActionError(null);
    try {
      await billingApi.requestRefund(refundModalInvoice.id, {
        amount: Number(refundAmount),
        reason: refundReason,
      });
      setRefundModalInvoice(null);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to request refund");
    } finally {
      setIsRefunding(false);
    }
  }

  if (authLoading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Billing</h1>

      {actionError && <p className="error-msg">{actionError}</p>}
      {loadError && <p className="error-msg">{loadError}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Billable Orders</h2>

        {!billableOrders && <p>Loading...</p>}
        {billableOrders && billableOrders.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No orders ready to bill.</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {billableOrders?.map((order) => {
            const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const isFormOpen = invoiceFormOrderId === order.id;
            const { subtotal, tax, total } = computeTotals(order, discountInput ? Number(discountInput) : 0);

            return (
              <div key={order.id} className="card">
                <h3>Table {order.table.number}</h3>
                <p style={{ color: "var(--color-text-muted)" }}>{order.status}</p>
                <p>
                  {order.items.length} item type(s), {totalItems} total
                </p>

                {!isFormOpen && (
                  <button type="button" onClick={() => openInvoiceForm(order.id)} style={{ marginTop: "0.75rem" }}>
                    Create Invoice
                  </button>
                )}

                {isFormOpen && (
                  <form
                    onSubmit={(e) => void handleCreateInvoice(e, order)}
                    style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
                  >
                    <div>
                      <label htmlFor={`pm-${order.id}`}>Payment method</label>
                      <select
                        id={`pm-${order.id}`}
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        style={{ width: "100%" }}
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="MOBILE">Mobile</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`disc-${order.id}`}>Discount (optional)</label>
                      <input
                        id={`disc-${order.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ fontSize: "0.875rem" }}>
                      <div>Subtotal: ${money(subtotal)}</div>
                      <div>Tax (13%): ${money(tax)}</div>
                      <div>Discount: -${money(discountInput || 0)}</div>
                      <strong>Total: ${money(total)}</strong>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="submit" disabled={isCreating}>
                        {isCreating ? "Creating..." : "Confirm & Generate Invoice"}
                      </button>
                      <button type="button" onClick={() => setInvoiceFormOrderId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem" }}>Recent Invoices</h2>

        {!invoices && <p>Loading...</p>}
        {invoices && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem" }}>Invoice #</th>
                    <th style={{ padding: "0.5rem" }}>Table</th>
                    <th style={{ padding: "0.5rem" }}>Total</th>
                    <th style={{ padding: "0.5rem" }}>Status</th>
                    <th style={{ padding: "0.5rem" }}>Payment</th>
                    <th style={{ padding: "0.5rem" }}>Created</th>
                    <th style={{ padding: "0.5rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((invoice) => (
                    <tr key={invoice.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem" }}>{invoice.invoiceNumber}</td>
                      <td style={{ padding: "0.5rem" }}>Table {invoice.order.table.number}</td>
                      <td style={{ padding: "0.5rem" }}>${money(invoice.totalAmount)}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.125rem 0.5rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "white",
                            backgroundColor: STATUS_COLOURS[invoice.status] ?? "var(--color-text-muted)",
                          }}
                        >
                          {invoice.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem" }}>{invoice.paymentMethod ?? "-"}</td>
                      <td style={{ padding: "0.5rem" }}>{new Date(invoice.createdAt).toLocaleString()}</td>
                      <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                        {invoice.status === "UNPAID" && (
                          <button
                            type="button"
                            disabled={busyId === invoice.id}
                            onClick={() => void handleConfirmPayment(invoice.id)}
                          >
                            Confirm Payment
                          </button>
                        )}
                        {invoice.status === "PAID" && (
                          <button type="button" onClick={() => openRefundModal(invoice)}>
                            Request Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {invoices.page} of {invoices.totalPages || 1}
              </span>
              <button type="button" disabled={page >= invoices.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </>
        )}
      </section>

      {refundModalInvoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <form
            onSubmit={handleRequestRefund}
            className="card"
            style={{ width: "100%", maxWidth: "24rem", display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h3>Request Refund - {refundModalInvoice.invoiceNumber}</h3>
            <div>
              <label htmlFor="refund-amount">Refund amount (max ${money(refundModalInvoice.totalAmount)})</label>
              <input
                id="refund-amount"
                type="number"
                min={0.01}
                max={Number(refundModalInvoice.totalAmount)}
                step="0.01"
                required
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="refund-reason">Reason</label>
              <input
                id="refund-reason"
                type="text"
                required
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            {actionError && <p className="error-msg">{actionError}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={isRefunding}>
                {isRefunding ? "Submitting..." : "Submit Refund Request"}
              </button>
              <button type="button" onClick={() => setRefundModalInvoice(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
