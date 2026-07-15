"use client";

import { useEffect, useState } from "react";
import { Banknote, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
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
import Modal from "../../../components/ui/Modal";

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

  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountInput, setDiscountInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Card payment step, inline within the same Create Invoice panel:
  // set once the invoice + PaymentIntent are created, cleared once the
  // whole panel closes. cardPaymentSucceeded tracks the client-side
  // Stripe result so the panel can show a "Confirm Payment" step before
  // closing - the invoice itself is only ever marked PAID by the
  // webhook, this is purely a UI acknowledgement step.
  const [cardClientSecret, setCardClientSecret] = useState<string | null>(null);
  const [cardPaymentSucceeded, setCardPaymentSucceeded] = useState(false);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);

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

  function openInvoicePanel(order: Order): void {
    setInvoiceOrder(order);
    setPaymentMethod("CASH");
    setDiscountInput("");
    setActionError(null);
    setCardClientSecret(null);
    setCardPaymentSucceeded(false);
    setPendingInvoiceId(null);
  }

  function closeInvoicePanel(): void {
    setInvoiceOrder(null);
    setCardClientSecret(null);
    setCardPaymentSucceeded(false);
    setPendingInvoiceId(null);
  }

  function computeTotals(order: Order, discount: number): { subtotal: number; tax: number; total: number } {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * item.quantity, 0);
    const tax = subtotal * DISPLAY_TAX_RATE;
    const total = subtotal + tax - discount;
    return { subtotal, tax, total };
  }

  // Single entry point for both payment methods. Cash settles
  // immediately (create + confirm in one click); Card creates the
  // invoice and a PaymentIntent, then switches this same panel to the
  // inline Stripe payment step instead of closing - the invoice stays
  // UNPAID until the webhook confirms the charge.
  async function handlePanelSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!invoiceOrder) return;
    setIsCreating(true);
    setActionError(null);
    try {
      const invoice = await billingApi.createInvoice({
        orderId: invoiceOrder.id,
        paymentMethod,
        discountAmount: discountInput ? Number(discountInput) : undefined,
      });

      if (paymentMethod === "CASH") {
        await billingApi.confirmPayment(invoice.id);
        closeInvoicePanel();
        await loadAll();
        return;
      }

      // clientSecret is never logged - only held in component state and
      // handed straight to Stripe's Elements provider (see
      // StripePaymentForm), which is the only thing allowed to use it.
      const { clientSecret } = await billingApi.createPaymentIntent(invoice.id);
      setPendingInvoiceId(invoice.id);
      setCardClientSecret(clientSecret);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to process invoice");
    } finally {
      setIsCreating(false);
    }
  }

  // Fires when Stripe's client-side confirmPayment reports success -
  // this is UI feedback only, not the source of truth for payment
  // status, so it just advances to the "Confirm Payment" step rather
  // than closing the panel outright.
  function handleCardPaymentClientSuccess(): void {
    setCardPaymentSucceeded(true);
  }

  // The cashier's final acknowledgement after seeing the success step.
  // Stripe's webhook (not this click) is the sole authority that marks
  // the invoice PAID, and it's delivered asynchronously - it can arrive
  // a moment after the browser saw confirmPayment succeed. Capture the
  // id before closing (which clears pendingInvoiceId), then poll
  // briefly so the list picks up PAID on its own instead of requiring a
  // manual refresh.
  async function handleFinalizeCardPayment(): Promise<void> {
    const invoiceId = pendingInvoiceId;
    closeInvoicePanel();
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

      <Modal
        isOpen={Boolean(invoiceOrder)}
        onClose={closeInvoicePanel}
        title={invoiceOrder ? `Create Invoice - Table ${invoiceOrder.table.number}` : "Create Invoice"}
        size="md"
        footer={
          cardClientSecret
            ? cardPaymentSucceeded
              ? (
                  <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => void handleFinalizeCardPayment()}>
                    Confirm Payment
                  </button>
                )
              : null // StripePaymentForm renders its own Cancel/Pay buttons inline
            : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={closeInvoicePanel}>
                    Cancel
                  </button>
                  <button type="submit" form="invoice-form" className="btn btn-primary" disabled={isCreating}>
                    {isCreating ? "Processing..." : paymentMethod === "CASH" ? "Confirm Payment" : "Continue to Payment"}
                  </button>
                </>
              )
        }
      >
        {invoiceOrder && (
          <>
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: 0 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>{actionError}</span>
              </div>
            )}

            {!cardClientSecret && (
              <form id="invoice-form" onSubmit={(e) => void handlePanelSubmit(e)} style={{ display: "contents" }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
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

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.375rem",
                    fontSize: "0.8125rem",
                    paddingTop: "0.5rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
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
              </form>
            )}

            {cardClientSecret && !cardPaymentSucceeded && (
              <>
                <div
                  className="flex justify-between font-semibold"
                  style={{ fontSize: "0.9375rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}
                >
                  <span>Amount due</span>
                  <span>${money(total)}</span>
                </div>
                <StripePaymentForm
                  clientSecret={cardClientSecret}
                  amountLabel={`$${money(total)}`}
                  onSuccess={handleCardPaymentClientSuccess}
                  onCancel={closeInvoicePanel}
                />
              </>
            )}

            {cardPaymentSucceeded && (
              <div className="alert alert-success">
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>Payment successful. Click Confirm Payment to finish.</span>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(refundModalInvoice)}
        onClose={() => setRefundModalInvoice(null)}
        title={refundModalInvoice ? `Request Refund - ${refundModalInvoice.invoiceNumber}` : "Request Refund"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRefundModalInvoice(null)}>
              Cancel
            </button>
            <button type="submit" form="refund-form" className="btn btn-primary" disabled={isRefunding}>
              {isRefunding ? "Submitting..." : "Submit Refund Request"}
            </button>
          </>
        }
      >
        {refundModalInvoice && (
          <>
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: 0 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>{actionError}</span>
              </div>
            )}
            <form id="refund-form" onSubmit={handleRequestRefund} style={{ display: "contents" }}>
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
            </form>
          </>
        )}
      </Modal>
    </>
  );
}
