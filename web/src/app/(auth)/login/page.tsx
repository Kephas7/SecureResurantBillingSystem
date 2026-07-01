"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useAuth } from "../../../context/auth.context";
import { loginSchema, type LoginFormData } from "../../../lib/validations/auth.schemas";

const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

function ResetSuccessBanner(): JSX.Element | null {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") {
    return null;
  }
  return <p className="success-msg">Password reset successfully. Please log in with your new password.</p>;
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  // Validation here (Zod + react-hook-form) is a UX layer only. An
  // attacker can bypass the browser entirely and POST directly to the
  // API, so every one of these rules is re-enforced independently by
  // LoginDto's class-validator decorators server-side (OWASP ASVS 5.1 -
  // never trust client-side input validation for security decisions).
  async function onSubmit(data: LoginFormData): Promise<void> {
    setServerError(null);
    try {
      const { requiresMfa } = await login(data.email, data.password, captchaToken ?? undefined);
      router.push(requiresMfa ? "/mfa-verify" : "/dashboard");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Login failed");
      // A captcha token is single-use - reset the widget so the user can
      // solve a fresh challenge on retry instead of resubmitting a token
      // the server will reject.
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    }
  }

  const captchaRequired = Boolean(CAPTCHA_SITE_KEY);
  const submitDisabled = isSubmitting || (captchaRequired && !captchaToken);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Suspense fallback={null}>
        <ResetSuccessBanner />
      </Suspense>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" {...register("email")} style={{ width: "100%" }} />
        {errors.email && <p className="error-msg">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
          style={{ width: "100%" }}
        />
        {errors.password && <p className="error-msg">{errors.password.message}</p>}
      </div>

      {/* Renders nothing when NEXT_PUBLIC_CAPTCHA_SITE_KEY isn't set, so
          local/dev testing is never blocked by a live challenge - matches
          the server-side dev bypass in AuthService.verifyCaptcha(). */}
      {CAPTCHA_SITE_KEY && (
        <HCaptcha
          ref={captchaRef}
          sitekey={CAPTCHA_SITE_KEY}
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />
      )}

      {serverError && <p className="error-msg">{serverError}</p>}

      <button type="submit" disabled={submitDisabled} style={{ width: "100%" }}>
        {isSubmitting ? "Signing in..." : "Login"}
      </button>

      {/* Placed below the form, not prominently, to slightly reduce the
          surface for social-engineering attacks that target password-reset
          flows as an easier path than guessing credentials. */}
      <p style={{ textAlign: "center", fontSize: "0.875rem" }}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </form>
  );
}

export default function LoginPage(): JSX.Element {
  return <LoginForm />;
}
