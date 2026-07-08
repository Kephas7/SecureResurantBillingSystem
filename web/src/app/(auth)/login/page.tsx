"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { UtensilsCrossed, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { loginSchema, type LoginFormData } from "../../../lib/validations/auth.schemas";

const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

function ResetSuccessBanner(): JSX.Element | null {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") {
    return null;
  }
  return (
    <div className="alert alert-success">
      <span>Password reset successfully. Please log in with your new password.</span>
    </div>
  );
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-card">
      <div className="login-logo">
        <UtensilsCrossed size={22} />
        Restaurant Secure
      </div>

      <h1 className="login-title">Sign in to your account</h1>
      <p className="login-subtitle">Enter your credentials to continue</p>

      <Suspense fallback={null}>
        <ResetSuccessBanner />
      </Suspense>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <div style={{ position: "relative" }}>
            <Mail
              size={16}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              id="email"
              type="email"
              autoComplete="username"
              {...register("email")}
              className={`form-input${errors.email ? " error" : ""}`}
              style={{ paddingLeft: "2.25rem" }}
              placeholder="you@restaurant.local"
            />
          </div>
          {errors.email && <p className="form-error">{errors.email.message}</p>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <div style={{ position: "relative" }}>
            <Lock
              size={16}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              {...register("password")}
              className={`form-input${errors.password ? " error" : ""}`}
              style={{ paddingLeft: "2.25rem", paddingRight: "2.25rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="form-error">{errors.password.message}</p>}
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

        {serverError && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{serverError}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={submitDisabled} style={{ justifyContent: "center" }}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>

        {/* Placed below the form, not prominently, to slightly reduce the
            surface for social-engineering attacks that target password-reset
            flows as an easier path than guessing credentials. */}
        <p style={{ textAlign: "right", fontSize: "0.8125rem", margin: 0 }}>
          <Link href="/forgot-password" style={{ color: "var(--brand)" }}>
            Forgot password?
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return <LoginForm />;
}
