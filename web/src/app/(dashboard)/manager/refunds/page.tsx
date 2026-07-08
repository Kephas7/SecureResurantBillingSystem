"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "../../../../context/auth.context";
import { billingApi, type RefundRequest } from "../../../../lib/api";

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

function outcomeBadgeClass(status: string): string {
  return status === "APPROVED" ? "badge-green" : "badge-red";
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
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Refund Requests</h1>
          <p className="page-subtitle">Review and decide on pending refund requests.</p>
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

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Pending</h2>
            {pending && <span className="badge badge-amber">{pending.length}</span>}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!pending && <p style={{ padding: "1.25rem" }}>Loading...</p>}
            {pending && pending.length === 0 && <div className="empty-state">No pending refund requests.</div>}
            {pending && pending.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Reason</th>
                      <th>Requested at</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((refund) => (
                      <tr key={refund.id}>
                        <td>{refund.invoice?.invoiceNumber ?? "-"}</td>
                        <td>${money(refund.amount)}</td>
                        <td>{refund.reason}</td>
                        <td>{new Date(refund.createdAt).toLocaleString()}</td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={busyId === refund.id}
                              onClick={() => void handleApprove(refund.id)}
                            >
                              {busyId === refund.id ? "..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={busyId === refund.id}
                              onClick={() => void handleReject(refund.id)}
                            >
                              {busyId === refund.id ? "..." : "Reject"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recently Decided</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!decided && <p style={{ padding: "1.25rem" }}>Loading...</p>}
            {decided && decided.length === 0 && <div className="empty-state">No decided refund requests yet.</div>}
            {decided && decided.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Outcome</th>
                      <th>Decided at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decided.map((refund) => (
                      <tr key={refund.id}>
                        <td>{refund.invoice?.invoiceNumber ?? "-"}</td>
                        <td>${money(refund.amount)}</td>
                        <td>
                          <span className={`badge ${outcomeBadgeClass(refund.status)}`}>{refund.status}</span>
                        </td>
                        <td>{refund.decidedAt ? new Date(refund.decidedAt).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
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
