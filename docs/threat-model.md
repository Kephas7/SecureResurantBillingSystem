# Threat Model — Secure Restaurant Billing & Management System

Method: STRIDE, applied per major component. Fill in as features are built;
keep this updated alongside commits so the report's "design and implementation"
section can cite real decisions made during development, not reconstructed
ones.

## Assets

- Customer/order data
- Payment/invoice records
- Employee accounts and credentials
- Inventory and supplier data
- Audit logs (integrity of evidence itself is an asset)
- System configuration / secrets

## Components / attack surfaces

- Public web frontend (Next.js)
- API (NestJS) — auth endpoints, RBAC-protected resource endpoints
- PostgreSQL database
- Redis (sessions, rate-limit counters)
- CI/CD pipeline and container registry

## STRIDE analysis (starter — expand per feature)

| Component | Threat (STRIDE) | Description | Mitigation |
|---|---|---|---|
| Auth endpoints | Spoofing | Credential stuffing / brute force login | Rate limiting, account lockout, CAPTCHA, MFA |
| Session cookie | Tampering | Session fixation / hijacking | HttpOnly, Secure, SameSite cookies, session regeneration on login |
| Order/Invoice API | Repudiation | User denies performing an action (e.g. cancelling a paid order) | Append-only audit log tied to authenticated actor ID |
| Invoice endpoint | Information Disclosure | IDOR — accessing another table's invoice via ID guessing | Server-side ownership/role check on every resource access |
| Refund flow | Elevation of Privilege | Cashier attempts to self-approve a refund | RBAC: refund approval restricted to Manager role, enforced server-side |
| Audit log table | Tampering | Compromised app account rewrites logs to hide an action | DB role for app has INSERT/SELECT only on audit_log, no UPDATE/DELETE |
| CI/CD | Tampering | Malicious dependency introduces backdoor | `npm audit` in CI, lockfiles committed, Dependabot/security scanning |

## Notes

- Update this table as each module (Day 5–7 in the project plan) is built.
- Each pen test finding (Day 8) should trace back to a row here, or be added
  as a new row if it wasn't anticipated — that gap itself is worth discussing
  in the report's critical analysis section.
