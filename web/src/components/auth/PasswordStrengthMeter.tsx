"use client";

const LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"];
const COLOURS = ["#dc2626", "#dc2626", "#d97706", "#eab308", "#16a34a"];

function calculateScore(password: string): number {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 1;
  return score;
}

// Password strength feedback is a UX mechanism recommended by OWASP to
// guide users toward stronger passwords without enforcing rules they find
// confusing. The actual enforcement happens server-side in the DTO -
// this meter can be fully bypassed and must never be treated as validation.
export function PasswordStrengthMeter({ password }: { password: string }): JSX.Element {
  const score = calculateScore(password);
  const colour = COLOURS[score];
  const label = password.length === 0 ? "" : LABELS[score];

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            style={{
              height: "0.25rem",
              flex: 1,
              borderRadius: "9999px",
              backgroundColor: segment < score ? colour : "var(--color-border)",
              transition: "background-color 0.2s",
            }}
          />
        ))}
      </div>
      {label && (
        <span style={{ fontSize: "0.75rem", color: colour }}>{label}</span>
      )}
    </div>
  );
}
