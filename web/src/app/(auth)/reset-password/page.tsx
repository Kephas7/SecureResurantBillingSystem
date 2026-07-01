"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
    <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register("newPassword")}
          style={{ width: "100%" }}
        />
        <PasswordStrengthMeter password={newPassword} />
        {errors.newPassword && <p className="error-msg">{errors.newPassword.message}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
          style={{ width: "100%" }}
        />
        {errors.confirmPassword && <p className="error-msg">{errors.confirmPassword.message}</p>}
      </div>

      {serverError && <p className="error-msg">{serverError}</p>}

      <button type="submit" disabled={isSubmitting} style={{ width: "100%" }}>
        {isSubmitting ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
