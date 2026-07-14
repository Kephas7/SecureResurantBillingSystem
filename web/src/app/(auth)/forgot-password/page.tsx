"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UtensilsCrossed } from "lucide-react";
import { authApi } from "../../../lib/api";
import { forgotPasswordSchema, type ForgotPasswordFormData } from "../../../lib/validations/auth.schemas";

export default function ForgotPasswordPage(): JSX.Element {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({ resolver: zodResolver(forgotPasswordSchema) });

  // Always shows the same success message regardless of whether the email
  // is registered - matches the API's behaviour (AuthService.requestPasswordReset)
  // so this page can't be used to enumerate accounts either.
  async function onSubmit(data: ForgotPasswordFormData): Promise<void> {
    await authApi.requestPasswordReset(data.email).catch(() => undefined);
    setSubmitted(true);
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        <UtensilsCrossed size={22} />
        Big Bites
      </div>
      <h1 className="login-title">Forgot password</h1>
      <p className="login-subtitle">We&apos;ll send you a reset link if the address is registered.</p>

      {submitted ? (
        <div className="alert alert-success">
          <span>If that email address is registered, you will receive a password reset link shortly.</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              {...register("email")}
              className={`form-input${errors.email ? " error" : ""}`}
            />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting} style={{ justifyContent: "center" }}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </div>
  );
}
