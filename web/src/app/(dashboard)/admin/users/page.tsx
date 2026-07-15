"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck, Shield, AlertCircle, X } from "lucide-react";
import { useAuth } from "../../../../context/auth.context";
import { usersApi, type AdminUser, type UpdateUserPayload } from "../../../../lib/api";
import { roleBadgeClass } from "../../../../lib/roles";
import { PasswordStrengthMeter } from "../../../../components/auth/PasswordStrengthMeter";

const ASSIGNABLE_ROLES = ["MANAGER", "CASHIER", "WAITER", "KITCHEN"];

interface CreateFormState {
  email: string;
  password: string;
  fullName: string;
  roleName: string;
}

const EMPTY_CREATE_FORM: CreateFormState = { email: "", password: "", fullName: "", roleName: ASSIGNABLE_ROLES[0] };

function statusBadgeClass(isActive: boolean): string {
  return isActive ? "badge-green" : "badge-gray";
}

export default function AdminUsersPage(): JSX.Element | null {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [isCreating, setIsCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
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

  function openCreatePanel(): void {
    setCreateForm(EMPTY_CREATE_FORM);
    setActionError(null);
    setShowCreatePanel(true);
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsCreating(true);
    setActionError(null);
    try {
      await usersApi.create(createForm);
      setShowCreatePanel(false);
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(u: AdminUser): void {
    setEditingUser(u);
    setEditForm({ fullName: u.fullName, roleName: u.role, isActive: u.isActive });
    setActionError(null);
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingUser) return;
    setIsSaving(true);
    setActionError(null);
    try {
      await usersApi.update(editingUser.id, editForm);
      setEditingUser(null);
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

  async function handleActivate(id: string): Promise<void> {
    setBusyRowId(id);
    setActionError(null);
    try {
      await usersApi.update(id, { isActive: true });
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to activate user");
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
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Create, edit, and manage staff accounts.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreatePanel}>
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      <div className="page-content">
        {actionError && !showCreatePanel && !editingUser && (
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

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Users</h2>
            {users && <span className="badge badge-gray">{users.length} total</span>}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!loadError && !users && <p style={{ padding: "1.25rem" }}>Loading users...</p>}

            {users && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>MFA</th>
                      <th>Failed Attempts</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const needsUnlock = u.failedLoginAttempts >= 5 || Boolean(u.lockedUntil);
                      const isBusy = busyRowId === u.id;

                      return (
                        <tr key={u.id}>
                          <td>{u.fullName}</td>
                          <td>{u.email}</td>
                          <td>
                            <span className={`badge ${roleBadgeClass(u.role)}`}>{u.role}</span>
                          </td>
                          <td>
                            <span className={`badge ${statusBadgeClass(u.isActive)}`}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            {u.mfaEnabled ? (
                              <ShieldCheck size={16} style={{ color: "var(--success)" }} />
                            ) : (
                              <Shield size={16} style={{ color: "var(--text-muted)" }} />
                            )}
                          </td>
                          <td>{u.failedLoginAttempts}</td>
                          <td>
                            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(u)}>
                                Edit
                              </button>
                              {needsUnlock && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "var(--warning-light)", color: "var(--warning)", borderColor: "var(--warning-border)" }}
                                  disabled={isBusy}
                                  onClick={() => void handleUnlock(u.id)}
                                >
                                  {isBusy ? "..." : "Unlock"}
                                </button>
                              )}
                              {u.isActive ? (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={isBusy}
                                  onClick={() => void handleDeactivate(u.id)}
                                >
                                  {isBusy ? "..." : "Deactivate"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm"
                                  disabled={isBusy}
                                  onClick={() => void handleActivate(u.id)}
                                >
                                  {isBusy ? "..." : "Activate"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreatePanel && (
        <div className="panel-overlay" onClick={() => setShowCreatePanel(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Create New User</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={() => setShowCreatePanel(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "contents" }}>
              <div className="panel-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-email">
                    Email
                  </label>
                  <input
                    id="new-email"
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-password">
                    Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="form-input"
                  />
                  <PasswordStrengthMeter password={createForm.password} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-fullname">
                    Full Name
                  </label>
                  <input
                    id="new-fullname"
                    type="text"
                    required
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-role">
                    Role
                  </label>
                  <select
                    id="new-role"
                    value={createForm.roleName}
                    onChange={(e) => setCreateForm({ ...createForm, roleName: e.target.value })}
                    className="form-select"
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                {actionError && (
                  <div className="alert alert-danger">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreatePanel(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="panel-overlay" onClick={() => setEditingUser(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3 className="panel-title">Edit User</h3>
              <button type="button" className="btn btn-icon btn-secondary" onClick={() => setEditingUser(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="panel-body">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={editingUser.email} disabled className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-fullname">
                  Full Name
                </label>
                <input
                  id="edit-fullname"
                  value={editForm.fullName ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-role">
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editForm.roleName ?? editingUser.role}
                  onChange={(e) => setEditForm({ ...editForm, roleName: e.target.value })}
                  className="form-select"
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-status">
                  Status
                </label>
                <select
                  id="edit-status"
                  value={String(editForm.isActive ?? editingUser.isActive)}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "true" })}
                  className="form-select"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              {actionError && (
                <div className="alert alert-danger">
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                  <span>{actionError}</span>
                </div>
              )}
            </div>
            <div className="panel-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={isSaving} onClick={() => void handleSaveEdit()}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
