"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

  if (submitted) {
    return (
      <div className="card">
        <p className="success-msg">
          If that email address is registered, you will receive a password reset link shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" {...register("email")} style={{ width: "100%" }} />
        {errors.email && <p className="error-msg">{errors.email.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} style={{ width: "100%" }}>
        {isSubmitting ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
