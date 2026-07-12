"use client";

import { useEffect, useState } from "react";
import { Banknote, CreditCard, Smartphone, AlertCircle, X } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import {
  billingApi,
  ordersApi,
  type Order,
  type Invoice,
  type InvoiceStatus,
  type PaymentMethod,
  type PaginatedInvoices,
} from "../../../lib/api";
import { StripePaymentForm } from "../../../components/billing/StripePaymentForm";

// Display-only estimate to preview the total before submission. The
// authoritative calculation (including the real TAX_RATE from env) is
// always done server-side in BillingService.createInvoice - this is
// just so the cashier isn't surprised by the confirmed total.
const DISPLAY_TAX_RATE = 0.13;

const STATUS_BADGE_CLASS: Record<InvoiceStatus, string> = {
  UNPAID: "badge-amber",
  PAID: "badge-green",
  REFUNDED: "badge-red",
  PARTIALLY_REFUNDED: "badge-red",
  VOID: "badge-gray",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "MOBILE", label: "Mobile", icon: Smartphone },
];

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

  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountInput, setDiscountInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [refundModalInvoice, setRefundModalInvoice] = useState<Invoice | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);

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

  function openInvoicePanel(order: Order): void {
    setInvoiceOrder(order);
    setPaymentMethod("CASH");
    setDiscountInput("");
    setActionError(null);
  }

  function closeInvoicePanel(): void {
    setInvoiceOrder(null);
  }

  function computeTotals(order: Order, discount: number): { subtotal: number; tax: number; total: number } {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * item.quantity, 0);
    const tax = subtotal * DISPLAY_TAX_RATE;
    const total = subtotal + tax - discount;
    return { subtotal, tax, total };
  }

  async function handleCreateInvoice(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!invoiceOrder) return;
    setIsCreating(true);
    setActionError(null);
    try {
      await billingApi.createInvoice({
        orderId: invoiceOrder.id,
        paymentMethod,
        discountAmount: discountInput ? Number(discountInput) : undefined,
      });
      closeInvoicePanel();
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

  async function openPaymentModal(invoice: Invoice): Promise<void> {
    setBusyId(invoice.id);
    setActionError(null);
    try {
      // clientSecret is never logged - only held in component state and
      // handed straight to Stripe's Elements provider (see
      // StripePaymentForm), which is the only thing allowed to use it.
      const { clientSecret } = await billingApi.createPaymentIntent(invoice.id);
      setPaymentInvoice(invoice);
      setPaymentClientSecret(clientSecret);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start Stripe payment");
    } finally {
      setBusyId(null);
    }
  }

  function closePaymentModal(): void {
    setPaymentInvoice(null);
    setPaymentClientSecret(null);
  }

  async function handlePaymentSuccess(): Promise<void> {
    // Stripe's webhook (not this browser confirming the charge) is the
    // sole authority that actually marks the invoice PAID, and it's
    // delivered asynchronously - it can arrive a moment after this
    // browser sees confirmPayment succeed. Capture the id before closing
    // the modal (which clears paymentInvoice), then poll briefly so the
    // list picks up PAID on its own instead of requiring a manual refresh.
    const invoiceId = paymentInvoice?.id;
    closePaymentModal();
    await loadAll();

    if (!invoiceId) return;

    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const invoice = await billingApi.getInvoice(invoiceId);
        if (invoice.status !== "UNPAID") {
          await loadAll();
          return;
        }
      } catch {
        return;
      }
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

  const { subtotal, tax, total } = invoiceOrder
    ? computeTotals(invoiceOrder, discountInput ? Number(discountInput) : 0)
    : { subtotal: 0, tax: 0, total: 0 };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Invoices, payments, and receipts.</p>
        </div>
      </div>

      <div className="page-content">
        {actionError && !invoiceOrder && !refundModalInvoice && (
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

        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Billable Orders</h2>

        {!billableOrders && <p>Loading...</p>}
        {billableOrders && billableOrders.length === 0 && <p className="text-muted">No orders ready to bill.</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          {billableOrders?.map((order) => {
            const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const { subtotal: orderSubtotal } = computeTotals(order, 0);

            return (
              <div key={order.id} className="table-card">
                <div>
                  <div className="table-card-number">Table {order.table.number}</div>
                  <span className="badge badge-blue">{order.status}</span>
                </div>
                <div className="table-card-detail">
                  {order.items.length} item type(s), {totalItems} total
                </div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                  ${money(orderSubtotal)}{" "}
                  <span className="text-muted text-sm" style={{ fontWeight: 400 }}>
                    (subtotal)
                  </span>
                </div>
                <button type="button" className="btn btn-primary w-full" style={{ justifyContent: "center" }} onClick={() => openInvoicePanel(order)}>
                  Create Invoice
                </button>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Invoices</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!invoices && <p style={{ padding: "1.25rem" }}>Loading...</p>}
            {invoices && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Table</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceNumber}</td>
                        <td>Table {invoice.order.table.number}</td>
                        <td>${money(invoice.totalAmount)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE_CLASS[invoice.status]}`}>{invoice.status.replace(/_/g, " ")}</span>
                        </td>
                        <td>{invoice.paymentMethod ?? "-"}</td>
                        <td>{new Date(invoice.createdAt).toLocaleString()}</td>
                        <td>
                          <div className="flex gap-2">
                            {invoice.status === "UNPAID" && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={busyId === invoice.id}
                                  onClick={() => void openPaymentModal(invoice)}
                                >
                                  {busyId === invoice.id ? "..." : "Pay with Stripe"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm"
                                  disabled={busyId === invoice.id}
                                  onClick={() => void handleConfirmPayment(invoice.id)}
                                >
                                  {busyId === invoice.id ? "..." : "Confirm Payment"}
                                </button>
                              </>
                            )}
                            {invoice.status === "PAID" && (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openRefundModal(invoice)}>
                                Request Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {invoices && (
              <div className="pagination" style={{ padding: "1rem 1.25rem" }}>
                <span className="pagination-info">
                  Page {invoices.page} of {invoices.totalPages || 1}
                </span>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= invoices.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {invoiceOrder && (
        <div className="panel-overlay" onClick={closeInvoicePanel}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Create Invoice - Table {invoiceOrder.table.number}</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={closeInvoicePanel} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateInvoice} style={{ display: "contents" }}>
              <div className="panel-body">
                <div className="form-group">
                  <label className="form-label">Order Summary</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {invoiceOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>
                          {item.quantity}× {item.menuItem.name}
                        </span>
                        <span>${money(Number(item.unitPrice ?? 0) * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                    {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                      const selected = paymentMethod === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPaymentMethod(value)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.375rem",
                            padding: "0.75rem 0.5rem",
                            borderRadius: "var(--radius)",
                            border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
                            background: selected ? "var(--brand-light)" : "var(--surface)",
                            color: selected ? "var(--brand)" : "var(--text-primary)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          <Icon size={18} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="discount">
                    Discount (optional)
                  </label>
                  <input
                    id="discount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", fontSize: "0.8125rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                  <div className="flex justify-between">
                    <span className="text-muted">Subtotal</span>
                    <span>${money(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Tax (13%)</span>
                    <span>${money(tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Discount</span>
                    <span>-${money(discountInput || 0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold" style={{ fontSize: "0.9375rem" }}>
                    <span>Total</span>
                    <span>${money(total)}</span>
                  </div>
                </div>

                {actionError && (
                  <div className="alert alert-danger">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <button type="button" className="btn btn-secondary" onClick={closeInvoicePanel}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {refundModalInvoice && (
        <div className="panel-overlay" onClick={() => setRefundModalInvoice(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Request Refund - {refundModalInvoice.invoiceNumber}</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={() => setRefundModalInvoice(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRequestRefund} style={{ display: "contents" }}>
              <div className="panel-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="refund-amount">
                    Refund amount (max ${money(refundModalInvoice.totalAmount)})
                  </label>
                  <input
                    id="refund-amount"
                    type="number"
                    min={0.01}
                    max={Number(refundModalInvoice.totalAmount)}
                    step="0.01"
                    required
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="refund-reason">
                    Reason
                  </label>
                  <input
                    id="refund-reason"
                    type="text"
                    required
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="form-input"
                  />
                </div>
                {actionError && (
                  <div className="alert alert-danger">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRefundModalInvoice(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isRefunding}>
                  {isRefunding ? "Submitting..." : "Submit Refund Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentInvoice && paymentClientSecret && (
        <div className="panel-overlay" onClick={closePaymentModal}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Pay {paymentInvoice.invoiceNumber} with Stripe</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={closePaymentModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <StripePaymentForm
              clientSecret={paymentClientSecret}
              amountLabel={`$${money(paymentInvoice.totalAmount)}`}
              onSuccess={() => void handlePaymentSuccess()}
              onCancel={closePaymentModal}
            />
          </div>
        </div>
      )}
    </>
  );
}
