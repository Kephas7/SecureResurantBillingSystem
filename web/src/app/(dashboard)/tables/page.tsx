"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users as UsersIcon, AlertCircle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { tablesApi, type RestaurantTable, type TableStatus } from "../../../lib/api";
import Modal from "../../../components/ui/Modal";

const STATUS_BADGE_CLASS: Record<TableStatus, string> = {
  AVAILABLE: "badge-green",
  OCCUPIED: "badge-amber",
  RESERVED: "badge-blue",
  OUT_OF_SERVICE: "badge-red",
};

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

  const [showPanel, setShowPanel] = useState(false);
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
    setShowPanel(false);
    setEditingId(null);
    setActionError(null);
  }

  function openCreatePanel(): void {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setActionError(null);
    setShowPanel(true);
  }

  function startEdit(table: RestaurantTable): void {
    setEditingId(table.id);
    setForm({ number: String(table.number), capacity: String(table.capacity) });
    setActionError(null);
    setShowPanel(true);
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

  const occupiedCount = tables?.filter((t) => t.status === "OCCUPIED").length ?? 0;
  const availableCount = tables?.filter((t) => t.status === "AVAILABLE").length ?? 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tables</h1>
          <p className="page-subtitle">
            {tables ? `${occupiedCount} occupied · ${availableCount} available · ${tables.length} total` : "Loading..."}
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={openCreatePanel}>
            <Plus size={16} />
            Add Table
          </button>
        )}
      </div>

      <div className="page-content">
        {actionError && !showPanel && (
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
        {!loadError && !tables && <p>Loading tables...</p>}

        {tables && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
            {tables.map((table) => (
              <div key={table.id} className="table-card">
                <div>
                  <div className="table-card-number">Table {table.number}</div>
                  <div className="table-card-detail">
                    <UsersIcon size={13} />
                    {table.capacity} seats
                  </div>
                </div>

                <span className={`badge ${STATUS_BADGE_CLASS[table.status]}`}>{table.status.replace(/_/g, " ")}</span>

                {/* Status is read-only here by design: table status is
                    driven automatically by the order lifecycle (an order
                    occupies a table on creation, frees it on payment), not
                    set manually - see Day 5 design decision. */}
                {canManage && (
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(table)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === table.id}
                      onClick={() => void handleDelete(table.id)}
                    >
                      {busyId === table.id ? "..." : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <Modal
          isOpen={showPanel}
          onClose={resetForm}
          title={editingId ? "Edit Table" : "Add Table"}
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" form="table-form" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : editingId ? "Save" : "Create"}
              </button>
            </>
          }
        >
          {actionError && (
            <div className="alert alert-danger" style={{ marginBottom: 0 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
              <span>{actionError}</span>
            </div>
          )}
          <form id="table-form" onSubmit={handleSubmit} style={{ display: "contents" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="table-number">
                Table number
              </label>
              <input
                id="table-number"
                type="number"
                min={1}
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="table-capacity">
                Capacity
              </label>
              <input
                id="table-capacity"
                type="number"
                min={1}
                max={20}
                required
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className="form-input"
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
