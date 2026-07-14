"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UtensilsCrossed } from "lucide-react";
import { authApi } from "../../../lib/api";
import { resetPasswordSchema, type ResetPasswordFormData } from "../../../lib/validations/auth.schemas";
import { PasswordStrengthMeter } from "../../../components/auth/PasswordStrengthMeter";

function ResetPasswordForm(): JSX.Element | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({ resolver: zodResolver(resetPasswordSchema) });

  const newPassword = watch("newPassword", "");

  useEffect(() => {
    if (!token) {
      router.replace("/forgot-password");
    }
  }, [token, router]);

  async function onSubmit(data: ResetPasswordFormData): Promise<void> {
    if (!token) return;

    setServerError(null);
    try {
      await authApi.resetPassword(token, data.newPassword);
      router.push("/login?reset=success");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Invalid or expired token");
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        <UtensilsCrossed size={22} />
        Big Bites
      </div>
      <h1 className="login-title">Reset your password</h1>
      <p className="login-subtitle">Choose a new password for your account</p>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
            className={`form-input${errors.newPassword ? " error" : ""}`}
          />
          <PasswordStrengthMeter password={newPassword} />
          {errors.newPassword && <p className="form-error">{errors.newPassword.message}</p>}
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
            className={`form-input${errors.confirmPassword ? " error" : ""}`}
          />
          {errors.confirmPassword && <p className="form-error">{errors.confirmPassword.message}</p>}
        </div>

        {serverError && <p className="form-error">{serverError}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting} style={{ justifyContent: "center" }}>
          {isSubmitting ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
