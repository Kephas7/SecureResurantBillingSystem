"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { authApi } from "../../../lib/api";
import { changePasswordSchema, type ChangePasswordFormData } from "../../../lib/validations/auth.schemas";
import { PasswordStrengthMeter } from "../../../components/auth/PasswordStrengthMeter";

// SECURITY: This screen is a mandatory interstitial, not a normal auth
// page - there is deliberately no link back to the dashboard and no way
// to dismiss it. A user only leaves via a successful password change.
// (See SessionGuard's password-expiry check, which sets session.passwordExpired
// and is re-evaluated on every request, not just on login.)
export default function PasswordExpiredPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({ resolver: zodResolver(changePasswordSchema) });

  const newPassword = watch("newPassword", "");

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.passwordExpired) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  async function onSubmit(data: ChangePasswordFormData): Promise<void> {
    setServerError(null);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      const me = await authApi.me();
      setUser({
        id: me.id,
        email: me.email,
        fullName: me.fullName,
        role: me.role,
        passwordExpired: me.passwordExpired,
        passwordChangedAt: me.passwordChangedAt,
      });
      router.replace("/dashboard");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Password change failed");
    }
  }

  if (isLoading || !user || !user.passwordExpired) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fffbf5",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1.5px solid #e8d5b7",
          borderRadius: "12px",
          boxShadow: "0 4px 24px rgba(26, 15, 0, 0.06)",
          padding: "2.5rem",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "#fef2f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <ShieldAlert size={24} color="#dc2626" />
        </div>

        <h1
          style={{
            fontSize: "1.375rem",
            fontWeight: 700,
            color: "#1a0f00",
            textAlign: "center",
            letterSpacing: "-0.02em",
            margin: "0 0 0.5rem",
          }}
        >
          Your password has expired
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#a07d55",
            textAlign: "center",
            margin: "0 0 2rem",
            lineHeight: 1.5,
          }}
        >
          For security, passwords must be changed every 90 days. Please set
          a new password to continue.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="currentPassword"
              style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#1a0f00", marginBottom: "0.375rem" }}
            >
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
              style={{
                width: "100%",
                padding: "0.5625rem 0.875rem",
                border: `1.5px solid ${errors.currentPassword ? "#dc2626" : "#e8d5b7"}`,
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#1a0f00",
                background: "#ffffff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {errors.currentPassword && (
              <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="newPassword"
              style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#1a0f00", marginBottom: "0.375rem" }}
            >
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
              style={{
                width: "100%",
                padding: "0.5625rem 0.875rem",
                border: `1.5px solid ${errors.newPassword ? "#dc2626" : "#e8d5b7"}`,
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#1a0f00",
                background: "#ffffff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <PasswordStrengthMeter password={newPassword} />
            {errors.newPassword && (
              <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#1a0f00", marginBottom: "0.375rem" }}
            >
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              style={{
                width: "100%",
                padding: "0.5625rem 0.875rem",
                border: `1.5px solid ${errors.confirmPassword ? "#dc2626" : "#e8d5b7"}`,
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#1a0f00",
                background: "#ffffff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {errors.confirmPassword && (
              <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {serverError && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                color: "#dc2626",
                fontSize: "0.875rem",
              }}
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              marginTop: "0.5rem",
              padding: "0.75rem",
              background: "#c2410c",
              color: "white",
              fontWeight: 700,
              fontSize: "0.9375rem",
              borderRadius: "6px",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? "Updating..." : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
