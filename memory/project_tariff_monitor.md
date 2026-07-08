---
name: Tariff Monitor Module
description: Full-stack tariff change monitoring system — architecture, data sources, key design decisions
type: project
---

Built 2026-04-08. Monitors US gov APIs for tariff changes, uses Claude AI to classify them, routes alerts through a broker review gate.

**Backend location:** `/server/` — separate Node.js service, port 3001
**Frontend location:** `/src/pages/tariff/` — 6 pages added to existing React app

**Data sources polled:**
- Federal Register API (every 15 min) — USTR/ITA tariff notices
- USITC HTS API (every 30 min) — per-HTS-code rate data, 1 req/sec rate limit
- CBP CSMS RSS (every 20 min) — CBP operational messages
- WhiteHouse.gov RSS (every 30 min) — executive orders / USTR actions

**AI classifier:** `claude-sonnet-4-20250514` via Anthropic SDK. Produces: summary, impactScore (1-10), htsCodes[], dutyBefore/After. All calls logged to AiAuditLog table.

**Non-bypassable broker review gate:** TariffChange.status must be 'approved' before any alert is sent. Enforced in alertQueue.ts processApprovedChange().

**DB:** PostgreSQL via Prisma. Models: TariffSource, TariffChange, Client, ClientHtsPortfolio, ClientHtsMatch, Alert, User, AiAuditLog

**Auth:** JWT (8h), roles: broker/admin/viewer. Broker+admin can approve/suppress changes.

**Tests:** 40 Vitest tests in server/tests/ covering sha256Differ, claudeClassifier JSON parsing, clientMatcher HTS prefix logic.

**Docker:** docker-compose.yml at root. Services: postgres, api, frontend (nginx reverse proxy).

**Why:** Regulatory risk — tariff changes (especially IEEPA, Section 301) can materially affect client duty costs within hours of Federal Register publication. Must reach customs brokers before clients are surprised by rate increases.

**How to apply:** When adding features, maintain the broker review gate — never allow direct alert dispatch from pollers. HTS matching uses 3-tier prefix (exact/8-digit/6-digit). Client mock data is in src/api/tariffApi.ts for dev without backend.
