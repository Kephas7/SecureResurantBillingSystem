"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../context/auth.context";
import { usersApi, type AdminUser, type UpdateUserPayload } from "../../../../lib/api";

const ASSIGNABLE_ROLES = ["MANAGER", "CASHIER", "WAITER", "KITCHEN"];

interface CreateFormState {
  email: string;
  password: string;
  fullName: string;
  roleName: string;
}

const EMPTY_CREATE_FORM: CreateFormState = { email: "", password: "", fullName: "", roleName: ASSIGNABLE_ROLES[0] };

export default function AdminUsersPage(): JSX.Element | null {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateUserPayload>({});
  const [isSaving, setIsSaving] = useState(false);

  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && currentUser && currentUser.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [authLoading, currentUser, router]);

  useEffect(() => {
    if (currentUser?.role === "ADMIN") {
      void loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function loadUsers(): Promise<void> {
    setLoadError(null);
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsCreating(true);
    setActionError(null);
    try {
      await usersApi.create(createForm);
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreateForm(false);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(u: AdminUser): void {
    setEditingId(u.id);
    setEditForm({ fullName: u.fullName, roleName: u.role, isActive: u.isActive });
    setActionError(null);
  }

  async function handleSaveEdit(id: string): Promise<void> {
    setIsSaving(true);
    setActionError(null);
    try {
      await usersApi.update(id, editForm);
      setEditingId(null);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id: string): Promise<void> {
    setBusyRowId(id);
    setActionError(null);
    try {
      await usersApi.deactivate(id);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to deactivate user");
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleUnlock(id: string): Promise<void> {
    setBusyRowId(id);
    setActionError(null);
    try {
      await usersApi.unlock(id);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unlock account");
    } finally {
      setBusyRowId(null);
    }
  }

  if (authLoading || !currentUser) {
    return <p>Loading...</p>;
  }

  if (currentUser.role !== "ADMIN") {
    return null;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1>User Management</h1>
        <button type="button" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? "Cancel" : "Create User"}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: "1.5rem", display: "grid", gap: "0.75rem", maxWidth: "24rem" }}>
          <div>
            <label htmlFor="new-email">Email</label>
            <input
              id="new-email"
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="new-password">Password</label>
            <input
              id="new-password"
              type="password"
              required
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="new-fullname">Full name</label>
            <input
              id="new-fullname"
              type="text"
              required
              value={createForm.fullName}
              onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="new-role">Role</label>
            <select
              id="new-role"
              value={createForm.roleName}
              onChange={(e) => setCreateForm({ ...createForm, roleName: e.target.value })}
              style={{ width: "100%" }}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          {actionError && <p className="error-msg">{actionError}</p>}
          <button type="submit" disabled={isCreating}>
            {isCreating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {!showCreateForm && actionError && <p className="error-msg" style={{ marginBottom: "1rem" }}>{actionError}</p>}

      {loadError && <p className="error-msg">{loadError}</p>}
      {!loadError && !users && <p>Loading users...</p>}

      {users && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem" }}>Email</th>
                <th style={{ padding: "0.5rem" }}>Role</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>MFA</th>
                <th style={{ padding: "0.5rem" }}>Failed Attempts</th>
                <th style={{ padding: "0.5rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isEditing = editingId === u.id;
                const needsUnlock = u.failedLoginAttempts >= 5 || Boolean(u.lockedUntil);
                const isBusy = busyRowId === u.id;

                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>
                      {isEditing ? (
                        <input
                          value={editForm.fullName ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                        />
                      ) : (
                        u.fullName
                      )}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{u.email}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {isEditing ? (
                        <select
                          value={editForm.roleName ?? u.role}
                          onChange={(e) => setEditForm({ ...editForm, roleName: e.target.value })}
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.role
                      )}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      {isEditing ? (
                        <select
                          value={String(editForm.isActive ?? u.isActive)}
                          onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "true" })}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      ) : u.isActive ? (
                        "Active"
                      ) : (
                        "Inactive"
                      )}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{u.mfaEnabled ? "Yes" : "No"}</td>
                    <td style={{ padding: "0.5rem" }}>{u.failedLoginAttempts}</td>
                    <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {isEditing ? (
                        <>
                          <button type="button" disabled={isSaving} onClick={() => void handleSaveEdit(u.id)}>
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEdit(u)}>
                          Edit
                        </button>
                      )}
                      {needsUnlock && (
                        <button type="button" disabled={isBusy} onClick={() => void handleUnlock(u.id)}>
                          {isBusy ? "..." : "Unlock"}
                        </button>
                      )}
                      {u.isActive && (
                        <button type="button" disabled={isBusy} onClick={() => void handleDeactivate(u.id)}>
                          {isBusy ? "..." : "Deactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
