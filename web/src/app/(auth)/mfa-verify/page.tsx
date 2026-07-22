"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { authApi } from "../../../lib/api";
import { useAuth } from "../../../context/auth.context";

export default function MfaVerifyPage(): JSX.Element {
  const router = useRouter();
  const { setUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Auto-submit on 6 digits is a UX pattern from banking apps that
    // reduces friction without compromising security - the server
    // validates the token regardless of how submission is triggered, so
    // this is purely a convenience, not a trust boundary.
    if (code.length === 6) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function submit(token: string): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      await authApi.verifyMfa(token);
      const me = await authApi.me();
      setUser({
        id: me.id,
        email: me.email,
        fullName: me.fullName,
        role: me.role,
        passwordExpired: me.passwordExpired,
        passwordChangedAt: me.passwordChangedAt,
      });
      router.push(me.passwordExpired ? "/password-expired" : "/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setCode("");

      // The controller only throws this exact message when there is no
      // session at all (as opposed to a session pending MFA, which never
      // hits this branch since /auth/mfa/verify checks session.userId
      // directly). That distinguishes "navigated here directly, never
      // logged in" from "typed the wrong code" - only the former should
      // send the user away from this page.
      if (message === "Authentication required") {
        router.push("/login");
        return;
      }

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        <UtensilsCrossed size={22} />
        Big Bites
      </div>
      <h1 className="login-title">Two-factor verification</h1>
      <p className="login-subtitle">Enter the 6-digit code from your authenticator app</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={isSubmitting}
          className="form-input"
          style={{ letterSpacing: "0.5rem", textAlign: "center", fontSize: "1.25rem" }}
        />

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={isSubmitting || code.length !== 6}
          className="btn btn-primary w-full"
          style={{ justifyContent: "center" }}
        >
          {isSubmitting ? "Verifying..." : "Verify"}
        </button>
      </div>
    </div>
  );
}
