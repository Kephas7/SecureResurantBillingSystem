# Secure Restaurant Billing & Management System

ST6005CEM Security — Coursework 2 (CW2)

A security-first restaurant billing and management system built to demonstrate
secure-by-design principles, OWASP Top 10 mitigation, RBAC, and internal
penetration testing as part of Coventry University's Security module.

## Stack

- **API**: NestJS (TypeScript), PostgreSQL, Prisma ORM, Redis (sessions + rate limiting)
- **Web**: Next.js (React, TypeScript)
- **Infra**: Docker Compose, GitHub Actions CI/CD

## Repository structure

```
restaurant-secure/
├── api/                  # NestJS backend
│   ├── src/
│   │   ├── modules/      # feature modules (auth, users, orders, billing, ...)
│   │   ├── common/       # guards, interceptors, pipes, decorators
│   │   └── config/       # env/config loading
│   └── prisma/
│       └── schema.prisma
├── web/                  # Next.js frontend
├── docs/                 # threat model, ADRs, pen test notes (working docs)
├── docker-compose.yml
└── .env.example
```

## Getting started (local dev)

```bash
cp .env.example .env
# edit .env with your own secrets before first run

docker compose up -d postgres redis
cd api && npm install && npx prisma migrate dev && npm run start:dev
cd ../web && npm install && npm run dev
```

Or run everything containerized:

```bash
docker compose up --build
```

API: http://localhost:4000
Web: http://localhost:3000

## Security documentation

See `/docs` for:
- `threat-model.md` — STRIDE threat model
- `adr/` — Architecture Decision Records for each major security choice
- `pentest/` — internal penetration test scope, findings, and retests

## Status

Day 1 of 10 — project scaffold, Docker Compose, and initial Prisma schema.
