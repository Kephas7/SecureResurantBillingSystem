"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../context/auth.context";
import { auditApi, type AuditLogEntry } from "../../../../lib/api";

const GREEN_ACTIONS = new Set(["LOGIN_SUCCESS", "LOGOUT"]);
const RED_ACTIONS = new Set(["LOGIN_FAILED", "ACCOUNT_LOCKED"]);
const BLUE_ACTIONS = new Set(["USER_CREATED", "USER_UPDATED"]);
const PURPLE_ACTIONS = new Set(["PASSWORD_CHANGED", "MFA_ENABLED"]);

function actionColour(action: string): string {
  if (GREEN_ACTIONS.has(action)) return "var(--color-success)";
  if (RED_ACTIONS.has(action)) return "var(--color-danger)";
  if (BLUE_ACTIONS.has(action)) return "#2563eb";
  if (PURPLE_ACTIONS.has(action)) return "#7c3aed";
  return "var(--color-text-muted)";
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
    <div>
      <h1>Audit Logs</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        Audit logs are append-only. Entries cannot be modified or deleted.
      </p>

      <div className="card" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div>
          <label htmlFor="filter-action">Action</label>
          <br />
          <select
            id="filter-action"
            value={actionFilter}
            onChange={(e) => {
              setPage(1);
              setActionFilter(e.target.value);
            }}
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-start">From</label>
          <br />
          <input
            id="filter-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              setPage(1);
              setStartDate(e.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor="filter-end">To</label>
          <br />
          <input
            id="filter-end"
            type="date"
            value={endDate}
            onChange={(e) => {
              setPage(1);
              setEndDate(e.target.value);
            }}
          />
        </div>
      </div>

      {loadError && <p className="error-msg">{loadError}</p>}
      {!loadError && !logs && <p>Loading logs...</p>}

      {logs && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem" }}>Timestamp</th>
                  <th style={{ padding: "0.5rem" }}>Actor</th>
                  <th style={{ padding: "0.5rem" }}>Action</th>
                  <th style={{ padding: "0.5rem" }}>Resource</th>
                  <th style={{ padding: "0.5rem" }}>Resource ID</th>
                  <th style={{ padding: "0.5rem" }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
                    <td style={{ padding: "0.5rem" }}>{log.actorEmail ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "white",
                          backgroundColor: actionColour(log.action),
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem" }}>{log.resource ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>{log.resourceId ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>{log.ipAddress ?? "-"}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                      No audit log entries match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
