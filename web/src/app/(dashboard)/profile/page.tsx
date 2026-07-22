"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { authApi, profileApi, type MeResponse } from "../../../lib/api";
import { changePasswordSchema, type ChangePasswordFormData } from "../../../lib/validations/auth.schemas";
import { PasswordStrengthMeter } from "../../../components/auth/PasswordStrengthMeter";
import Modal from "../../../components/ui/Modal";

const PASSWORD_EXPIRY_DAYS = 90;

function daysSince(dateIso: string): number {
  return Math.floor((Date.now() - new Date(dateIso).getTime()) / (1000 * 60 * 60 * 24));
}

function passwordAgeText(days: number): string {
  if (days <= 0) return "Last changed: today";
  if (days === 1) return "Last changed: 1 day ago";
  return `Last changed: ${days} days ago`;
}

// Presentation-only thresholds mirroring the 90-day expiry enforced
// server-side (SessionGuard) - this just gives the user advance warning
// before that guard starts rejecting their requests.
function passwordAgeColor(days: number): string {
  if (days < 30) return "var(--success)";
  if (days < 60) return "var(--warning)";
  return "var(--danger)";
}

export default function ProfilePage(): JSX.Element | null {
  const { user, setUser } = useAuth();

  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isChangingPassword },
  } = useForm<ChangePasswordFormData>({ resolver: zodResolver(changePasswordSchema) });

  const newPassword = watch("newPassword", "");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile(): Promise<void> {
    setLoadError(null);
    try {
      const data = await profileApi.get();
      setProfile(data);
      setFullName(data.fullName);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load profile");
    }
  }

  async function handleSaveProfile(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await profileApi.update({ fullName });
      setProfile(updated);
      // Keep the sidebar/dashboard name in sync without a full reload -
      // it reads from AuthProvider's user state, not this page's own.
      if (user) {
        setUser({ ...user, fullName: updated.fullName });
      }
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  function openPasswordModal(): void {
    setPasswordError(null);
    setPasswordSuccess(false);
    resetPasswordForm();
    setShowPasswordModal(true);
  }

  async function onChangePassword(data: ChangePasswordFormData): Promise<void> {
    setPasswordError(null);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      setPasswordSuccess(true);
      resetPasswordForm();
      await loadProfile();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Password change failed");
    }
  }

  if (loadError) {
    return (
      <div className="page-content">
        <div className="alert alert-danger">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-content">
        <p className="text-muted">Loading profile...</p>
      </div>
    );
  }

  const ageDays = daysSince(profile.passwordChangedAt);
  const ageColor = passwordAgeColor(ageDays);
  const daysUntilExpiry = PASSWORD_EXPIRY_DAYS - ageDays;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your account details, password, and security settings.</p>
        </div>
      </div>

      <div className="page-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "640px" }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Profile details</h2>
          </div>
          <div className="card-body">
            {saveError && (
              <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>Profile updated successfully.</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label" htmlFor="profile-fullname">
                  Full Name
                </label>
                <input
                  id="profile-fullname"
                  type="text"
                  required
                  maxLength={100}
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setSaveSuccess(false);
                  }}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={profile.email} disabled className="form-input" />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Contact an administrator to change your email address
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <input type="text" value={profile.role} disabled className="form-input" />
              </div>

              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving || fullName.trim().length === 0}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Password</h2>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.875rem", color: ageColor, fontWeight: 600 }}>
                {passwordAgeText(ageDays)}
              </p>
              {ageDays >= 60 && (
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--danger)" }}>
                  Your password expires in {Math.max(daysUntilExpiry, 0)} day
                  {daysUntilExpiry === 1 ? "" : "s"}.
                </p>
              )}
            </div>
            <div>
              <button type="button" className="btn btn-secondary" onClick={openPasswordModal}>
                <KeyRound size={16} />
                Change Password
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Two-factor authentication</h2>
          </div>
          <div className="card-body">
            {profile.mfaEnabled ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--success)", fontWeight: 600, fontSize: "0.875rem" }}>
                <ShieldCheck size={18} />
                <span>MFA is active</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  <ShieldOff size={18} />
                  <span>MFA is not enabled on your account</span>
                </div>
                <Link href="/mfa-setup" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                  Enable MFA
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Change Password"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
              {passwordSuccess ? "Close" : "Cancel"}
            </button>
            {!passwordSuccess && (
              <button
                type="submit"
                form="change-password-form"
                className="btn btn-primary"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Updating..." : "Update password"}
              </button>
            )}
          </>
        }
      >
        {passwordError && (
          <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{passwordError}</span>
          </div>
        )}
        {passwordSuccess && (
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>Password changed successfully.</span>
          </div>
        )}

        {!passwordSuccess && (
          <form
            id="change-password-form"
            onSubmit={handleSubmit(onChangePassword)}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="currentPassword">
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register("currentPassword")}
                className={`form-input${passwordErrors.currentPassword ? " error" : ""}`}
              />
              {passwordErrors.currentPassword && (
                <p className="form-error">{passwordErrors.currentPassword.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="newPassword">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...register("newPassword")}
                className={`form-input${passwordErrors.newPassword ? " error" : ""}`}
              />
              <PasswordStrengthMeter password={newPassword} />
              {passwordErrors.newPassword && <p className="form-error">{passwordErrors.newPassword.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
                className={`form-input${passwordErrors.confirmPassword ? " error" : ""}`}
              />
              {passwordErrors.confirmPassword && (
                <p className="form-error">{passwordErrors.confirmPassword.message}</p>
              )}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
