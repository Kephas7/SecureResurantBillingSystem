"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "../../../../context/auth.context";
import { auditApi, type AuditLogEntry } from "../../../../lib/api";

const GREEN_ACTIONS = new Set(["LOGIN_SUCCESS", "LOGOUT"]);
const RED_ACTIONS = new Set(["LOGIN_FAILED", "ACCOUNT_LOCKED"]);
const BLUE_ACTIONS = new Set(["USER_CREATED", "USER_UPDATED"]);
const PURPLE_ACTIONS = new Set(["PASSWORD_CHANGED", "MFA_ENABLED"]);

function actionBadgeClass(action: string): string {
  if (GREEN_ACTIONS.has(action)) return "badge-green";
  if (RED_ACTIONS.has(action)) return "badge-red";
  if (BLUE_ACTIONS.has(action)) return "badge-blue";
  if (PURPLE_ACTIONS.has(action)) return "badge-purple";
  return "badge-gray";
}

export default function AdminAuditPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      auditApi.getActions().then(setActions).catch(() => undefined);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      void loadLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, actionFilter, startDate, endDate]);

  async function loadLogs(): Promise<void> {
    setLoadError(null);
    try {
      const result = await auditApi.getLogs({
        page,
        action: actionFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(result.data);
      setTotalPages(result.totalPages);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load audit logs");
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  if (user.role !== "ADMIN") {
    return null;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Audit logs are append-only. Entries cannot be modified or deleted.</p>
        </div>
      </div>

      <div className="page-content">
        {loadError && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{loadError}</span>
          </div>
        )}

        <div className="card">
          <div className="filter-bar">
            <span className="filter-label">Action</span>
            <select
              value={actionFilter}
              onChange={(e) => {
                setPage(1);
                setActionFilter(e.target.value);
              }}
              className="form-select"
              style={{ width: "auto", minWidth: "160px" }}
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>

            <span className="filter-label">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPage(1);
                setStartDate(e.target.value);
              }}
              className="form-input"
              style={{ width: "auto" }}
            />

            <span className="filter-label">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPage(1);
                setEndDate(e.target.value);
              }}
              className="form-input"
              style={{ width: "auto" }}
            />
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {!loadError && !logs && <p style={{ padding: "1.25rem" }}>Loading logs...</p>}

            {logs && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Resource</th>
                      <th>Resource ID</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>{log.actorEmail ?? "-"}</td>
                        <td>
                          <span className={`badge ${actionBadgeClass(log.action)}`}>{log.action}</span>
                        </td>
                        <td>{log.resource ?? "-"}</td>
                        <td>{log.resourceId ?? "-"}</td>
                        <td>{log.ipAddress ?? "-"}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">No audit log entries match these filters.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {logs && (
              <div className="pagination" style={{ padding: "1rem 1.25rem" }}>
                <span className="pagination-info">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
