"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../context/auth.context";
import { billingApi, type RefundRequest } from "../../../../lib/api";

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

export default function ManagerRefundsPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [pending, setPending] = useState<RefundRequest[] | null>(null);
  const [decided, setDecided] = useState<RefundRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN" && user.role !== "MANAGER") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role === "ADMIN" || user?.role === "MANAGER") {
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll(): Promise<void> {
    setLoadError(null);
    try {
      const [pendingList, decidedList] = await Promise.all([
        billingApi.getPendingRefunds(),
        billingApi.getDecidedRefunds(20),
      ]);
      setPending(pendingList);
      setDecided(decidedList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load refund requests");
    }
  }

  async function handleApprove(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await billingApi.approveRefund(id);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve refund");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await billingApi.rejectRefund(id);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject refund");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return null;
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Refund Requests</h1>

      {actionError && <p className="error-msg">{actionError}</p>}
      {loadError && <p className="error-msg">{loadError}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Pending</h2>
        {!pending && <p>Loading...</p>}
        {pending && pending.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No pending refund requests.</p>
        )}
        {pending && pending.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem" }}>Invoice #</th>
                  <th style={{ padding: "0.5rem" }}>Amount</th>
                  <th style={{ padding: "0.5rem" }}>Reason</th>
                  <th style={{ padding: "0.5rem" }}>Requested at</th>
                  <th style={{ padding: "0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((refund) => (
                  <tr key={refund.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>{refund.invoice?.invoiceNumber ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>${money(refund.amount)}</td>
                    <td style={{ padding: "0.5rem" }}>{refund.reason}</td>
                    <td style={{ padding: "0.5rem" }}>{new Date(refund.createdAt).toLocaleString()}</td>
                    <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                      <button type="button" disabled={busyId === refund.id} onClick={() => void handleApprove(refund.id)}>
                        Approve
                      </button>
                      <button type="button" disabled={busyId === refund.id} onClick={() => void handleReject(refund.id)}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem" }}>Recently Decided</h2>
        {!decided && <p>Loading...</p>}
        {decided && decided.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No decided refund requests yet.</p>
        )}
        {decided && decided.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem" }}>Invoice #</th>
                  <th style={{ padding: "0.5rem" }}>Amount</th>
                  <th style={{ padding: "0.5rem" }}>Outcome</th>
                  <th style={{ padding: "0.5rem" }}>Decided at</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((refund) => (
                  <tr key={refund.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>{refund.invoice?.invoiceNumber ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>${money(refund.amount)}</td>
                    <td style={{ padding: "0.5rem" }}>{refund.status}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {refund.decidedAt ? new Date(refund.decidedAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
