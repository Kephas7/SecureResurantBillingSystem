"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { authApi } from "../../../lib/api";

export default function MfaSetupPage(): JSX.Element {
  const router = useRouter();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);

  // The QR code is generated server-side and contains only the otpauth://
  // URI. The raw TOTP secret is never sent to the client after setup is
  // confirmed - it is stored encrypted server-side (see
  // AuthService.encryptSecret). Here, the secret is only ever held long
  // enough to round-trip through verifyMfaSetup().
  //
  // Stored in component state, NOT localStorage: localStorage is
  // accessible to any JavaScript on the page, making it vulnerable to
  // exfiltration via XSS. Component state is cleared the moment this
  // component unmounts, giving the secret a much smaller and safer
  // lifetime (OWASP A03/XSS defence-in-depth).
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    authApi
      .setupMfa()
      .then((res) => {
        setQrCodeDataUrl(res.qrCodeDataUrl);
        setOtpauthUrl(res.otpauthUrl);
        const params = new URLSearchParams(res.otpauthUrl.split("?")[1] ?? "");
        setSecret(params.get("secret"));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to start MFA setup"))
      .finally(() => setIsLoading(false));
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!secret) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await authApi.verifyMfaSetup(token, secret);
      setIsDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="login-card">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="login-card">
        <div className="login-logo">
          <UtensilsCrossed size={22} />
          Restaurant Secure
        </div>
        <div className="alert alert-success">
          <span>MFA enabled successfully.</span>
        </div>
        <button type="button" className="btn btn-primary w-full" style={{ justifyContent: "center" }} onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        <UtensilsCrossed size={22} />
        Restaurant Secure
      </div>
      <h1 className="login-title">Set up two-factor authentication</h1>
      <p className="login-subtitle">Scan this QR code with Google Authenticator, Authy, or any TOTP app</p>

      {qrCodeDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrCodeDataUrl} alt="MFA QR code" width={180} height={180} style={{ display: "block", margin: "0 auto 1rem" }} />
      )}

      {!qrCodeDataUrl && otpauthUrl && <p className="form-error">QR code unavailable - use manual entry instead.</p>}

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="token">
            Verification code
          </label>
          <input
            id="token"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="form-input"
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={isSubmitting || token.length !== 6} className="btn btn-primary w-full" style={{ justifyContent: "center" }}>
          {isSubmitting ? "Verifying..." : "Enable MFA"}
        </button>
      </form>
    </div>
  );
}
