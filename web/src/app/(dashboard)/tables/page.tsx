"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth.context";
import { tablesApi, type RestaurantTable, type TableStatus } from "../../../lib/api";

const STATUS_COLOURS: Record<TableStatus, string> = {
  AVAILABLE: "var(--color-success)",
  OCCUPIED: "var(--color-warning)",
  RESERVED: "#2563eb",
  OUT_OF_SERVICE: "var(--color-danger)",
};

const STATUS_OPTIONS: TableStatus[] = ["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"];

interface FormState {
  number: string;
  capacity: string;
}

const EMPTY_FORM: FormState = { number: "", capacity: "" };

export default function TablesPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [tables, setTables] = useState<RestaurantTable[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // UI role checks are for UX only - hiding a button does not prevent a
  // technical user from calling the API. Server-side RolesGuard is the
  // real enforcement layer (see api/src/common/guards/roles.guard.ts).
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    if (!authLoading && user?.role === "KITCHEN") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user && user.role !== "KITCHEN") {
      void loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadTables(): Promise<void> {
    setLoadError(null);
    try {
      const data = await tablesApi.getAll();
      setTables(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load tables");
    }
  }

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(table: RestaurantTable): void {
    setEditingId(table.id);
    setForm({ number: String(table.number), capacity: String(table.capacity) });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      const payload = { number: Number(form.number), capacity: Number(form.capacity) };
      if (editingId) {
        await tablesApi.update(editingId, payload);
      } else {
        await tablesApi.create(payload);
      }
      resetForm();
      await loadTables();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save table");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: TableStatus): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await tablesApi.update(id, { status });
      await loadTables();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await tablesApi.delete(id);
      await loadTables();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete table");
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1>Tables</h1>
        {canManage && (
          <button type="button" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            {showForm ? "Cancel" : "Add Table"}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: "1.5rem", display: "grid", gap: "0.75rem", maxWidth: "20rem" }}>
          <div>
            <label htmlFor="table-number">Table number</label>
            <input
              id="table-number"
              type="number"
              min={1}
              required
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="table-capacity">Capacity</label>
            <input
              id="table-capacity"
              type="number"
              min={1}
              max={20}
              required
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          {actionError && <p className="error-msg">{actionError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : editingId ? "Save" : "Create"}
          </button>
        </form>
      )}

      {!showForm && actionError && <p className="error-msg" style={{ marginBottom: "1rem" }}>{actionError}</p>}
      {loadError && <p className="error-msg">{loadError}</p>}
      {!loadError && !tables && <p>Loading tables...</p>}

      {tables && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "1rem",
          }}
        >
          {tables.map((table) => (
            <div key={table.id} className="card">
              <h3>Table {table.number}</h3>
              <p style={{ color: "var(--color-text-muted)" }}>Capacity: {table.capacity}</p>
              <p>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "white",
                    backgroundColor: STATUS_COLOURS[table.status],
                  }}
                >
                  {table.status}
                </span>
              </p>

              {canManage && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <select
                    value={table.status}
                    disabled={busyId === table.id}
                    onChange={(e) => void handleStatusChange(table.id, e.target.value as TableStatus)}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => startEdit(table)}>
                      Edit
                    </button>
                    <button type="button" disabled={busyId === table.id} onClick={() => void handleDelete(table.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
