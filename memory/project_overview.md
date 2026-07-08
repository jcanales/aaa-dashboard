---
name: Project Overview — TradePortal
description: Core facts about the JD Group TradePortal project structure, stack, and purpose
type: project
---

Client: Grupo JD — Agencia Aduanal Jorge Díaz, S.C. (US-Mexico border customs brokerage)
App name: TradePortal

**Frontend:** React 18 + Vite + TypeScript + Tailwind CSS in root `/src/`. Zustand auth store (demo user: jcanales/demo1234, role: broker). Running on port 5173 dev / port 3000 prod.

**Backend:** Node.js 20 + Express + PostgreSQL 15 + Prisma in `/server/`. Running on port 3001.

**Brand colors:** blue #3A6FF9, teal #073b49, navy

**Why:** Modern replacement for RB Web Reports. Handles ABI (import) and AES (export) customs compliance reporting plus tariff change monitoring.

**How to apply:** When modifying UI, match existing Radix UI/shadcn component patterns. New API routes go in server/src/api/routes/. New pages go in src/pages/ with routes in src/App.tsx.
