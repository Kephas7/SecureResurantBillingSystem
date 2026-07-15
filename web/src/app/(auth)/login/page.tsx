"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { UtensilsCrossed, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { loginSchema, type LoginFormData } from "../../../lib/validations/auth.schemas";

const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

const FEATURES = [
  "Secure role-based access control",
  "Real-time kitchen order tracking",
  "Integrated Stripe payment processing",
];

const MOBILE_BREAKPOINT = 768;

function ResetSuccessBanner(): JSX.Element | null {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") {
    return null;
  }
  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "0.75rem 1rem",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: "6px",
        color: "#15803d",
        fontSize: "0.875rem",
      }}
    >
      Password reset successfully. Please log in with your new password.
    </div>
  );
}

// No window access during SSR - starts false, corrected on mount, then
// tracked live so resizing the browser toggles the split-screen layout
// without needing a reload.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function checkWidth(): void {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  return isMobile;
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const isMobile = useIsMobile();
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
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      {!isMobile && (
        <div
          style={{
            width: "45%",
            background: "#1a0f00",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "350px",
              height: "350px",
              borderRadius: "50%",
              background: "#c2410c",
              opacity: 0.06,
              top: "-80px",
              right: "-80px",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: "250px",
              height: "250px",
              borderRadius: "50%",
              background: "#c2410c",
              opacity: 0.04,
              bottom: "-60px",
              left: "-60px",
            }}
          />

          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "#c2410c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
              }}
            >
              <UtensilsCrossed size={24} color="white" />
            </div>

            <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#f5e6d0", letterSpacing: "-0.03em", lineHeight: 1 }}>
              Big Bites
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#a07d55",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: "0.5rem",
              }}
            >
              Restaurant Management System
            </div>

            <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {FEATURES.map((feature) => (
                <div key={feature} style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#8a6642", fontSize: "0.875rem" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#c2410c", flexShrink: 0 }} />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          width: isMobile ? "100%" : "55%",
          background: "#fffbf5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: "400px", width: "100%", padding: "0 2rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#1a0f00", letterSpacing: "-0.02em", margin: "0 0 0.25rem" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#a07d55", margin: "0 0 2rem" }}>Sign in to your Big Bites workspace</p>

          <Suspense fallback={null}>
            <ResetSuccessBanner />
          </Suspense>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#1a0f00", marginBottom: "0.375rem" }}>
                Email address
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#a07d55",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <Mail size={16} />
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  {...register("email")}
                  placeholder="you@bigbites.com"
                  style={{
                    width: "100%",
                    padding: "0.5625rem 0.875rem 0.5625rem 2.5rem",
                    border: `1.5px solid ${errors.email ? "#dc2626" : "#e8d5b7"}`,
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    color: "#1a0f00",
                    background: "#ffffff",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#c2410c")}
                  onBlur={(e) => (e.target.style.borderColor = errors.email ? "#dc2626" : "#e8d5b7")}
                />
              </div>
              {errors.email && <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>{errors.email.message}</p>}
            </div>

            <div style={{ marginTop: "1rem" }}>
              <label htmlFor="password" style={{ display: "block", fontWeight: 600, fontSize: "0.8125rem", color: "#1a0f00", marginBottom: "0.375rem" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#a07d55",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <Lock size={16} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  style={{
                    width: "100%",
                    padding: "0.5625rem 2.75rem 0.5625rem 2.5rem",
                    border: `1.5px solid ${errors.password ? "#dc2626" : "#e8d5b7"}`,
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    color: "#1a0f00",
                    background: "#ffffff",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#c2410c")}
                  onBlur={(e) => (e.target.style.borderColor = errors.password ? "#dc2626" : "#e8d5b7")}
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
                    cursor: "pointer",
                    color: "#a07d55",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.25rem" }}>{errors.password.message}</p>}
            </div>

            {/* Renders nothing when NEXT_PUBLIC_CAPTCHA_SITE_KEY isn't set, so
                local/dev testing is never blocked by a live challenge - matches
                the server-side dev bypass in AuthService.verifyCaptcha(). */}
            {CAPTCHA_SITE_KEY && (
              <div style={{ marginTop: "1rem" }}>
                <HCaptcha
                  ref={captchaRef}
                  sitekey={CAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
            )}

            {serverError && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1rem",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  color: "#dc2626",
                  fontSize: "0.875rem",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>{serverError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              style={{
                width: "100%",
                marginTop: "1.5rem",
                padding: "0.75rem",
                background: "#c2410c",
                color: "white",
                fontWeight: 700,
                fontSize: "0.9375rem",
                borderRadius: "6px",
                border: "none",
                cursor: submitDisabled ? "not-allowed" : "pointer",
                letterSpacing: "0.01em",
                opacity: submitDisabled ? 0.6 : 1,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!submitDisabled) e.currentTarget.style.background = "#9a3412";
              }}
              onMouseLeave={(e) => {
                if (!submitDisabled) e.currentTarget.style.background = "#c2410c";
              }}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            {/* Placed below the form, not prominently, to slightly reduce the
                surface for social-engineering attacks that target password-reset
                flows as an easier path than guessing credentials. */}
            <Link
              href="/forgot-password"
              style={{ marginTop: "1rem", textAlign: "right", display: "block", color: "#c2410c", fontSize: "0.8125rem", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Forgot password?
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage(): JSX.Element {
  return <LoginForm />;
}
