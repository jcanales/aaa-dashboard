# Duties Dashboard — Project Notes

**Stack:** React + TypeScript (Vite) frontend, Express/TypeScript backend, PostgreSQL (Prisma) for app-owned data, legacy SQL Server (raw `mssql` driver) for customs/duties data. Ports: frontend `5175`, backend `3001` (dev).

---

## Production & Dev Deployment

Both environments run on the same physical office server (hostname `AAM-Dashboard`, on the office LAN/VPN — its hostnames resolve to a private IP, not the public internet), isolated by path/port/pm2 process/Postgres container:

| | Production | Dev |
|---|---|---|
| URL | https://usbroker.jdgroup.net | https://dev-usbroker.jdgroup.net |
| App dir | `/opt/duties-dashboard` | `/opt/duties-dashboard-dev` |
| Web dir | `/var/www/duties-dashboard` | `/var/www/duties-dashboard-dev` |
| Backend port | 3001 | 3002 |
| Postgres port | 5433 | 5434 |
| pm2 process | `duties-backend` | `duties-backend-dev` |
| Deploy trigger | push to `master` | push to `dev` |
| Workflow | `.github/workflows/deploy-prod.yml` | `.github/workflows/deploy-dev.yml` |

- Deploys run on a **self-hosted GitHub Actions runner** installed on that same server (`/opt/actions-runner`, via `scripts/install-github-runner.sh`) — the office server doesn't accept inbound SSH from a GitHub-hosted runner, so the runner itself makes the outbound connection instead. Both workflows share the one runner (label `duties-dashboard`), so a dev and prod deploy queue rather than run in parallel.
- TLS is a **pre-issued wildcard cert** for `*.jdgroup.net` already on the box (`/etc/nginx/ssl/wildcard.jdgroup.net.{crt,key}`) — not certbot/Let's Encrypt, which could never reach this box to issue one. Any new `*.jdgroup.net` subdomain on this server reuses the same cert files (see `scripts/setup-server.sh`'s `DOMAIN`/`WILDCARD_CERT` params).
- `backend/docker-compose.yml` and `backend/ecosystem.config.cjs` are shared by both environments via env-var overrides (`COMPOSE_PROJECT_NAME`, `PM2_APP_NAME`, `PM2_MAX_MEMORY_RESTART`) rather than being duplicated — see the workflow files' `env:` blocks.
- `nginx`'s `client_max_body_size` is explicitly set to `15m` on the `/api/` location of both vhosts, matching `converterConversions.ts`'s multer limit — nginx's own 1MB default would otherwise 413 any PDF upload over ~1MB.
- Required GitHub repo secrets: `JWT_SECRET`/`PG_PASSWORD` (prod) and `JWT_SECRET_DEV`/`PG_PASSWORD_DEV` (dev, deliberately separate — a shared JWT_SECRET would let a dev-issued token authenticate against prod) plus `MSSQL_HOST`/`MSSQL_PORT`/`MSSQL_DATABASE`/`MSSQL_USER`/`MSSQL_PASSWORD` (shared between both — same legacy read-only SQL Server).

## Prisma Migrations

`backend/prisma/migrations/` contains a single consolidated **baseline** migration (`20260910000000_baseline`), not incremental history. Production's schema had drifted ahead of what was committed — 13 migration folders were applied there at some point and are still recorded in its `_prisma_migrations` table, but the folders themselves were never committed (or were later removed), leaving the repo unable to `migrate deploy` onto a fresh database. The baseline was generated via `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma` and verified to introduce zero drift against prod's live database before replacing the old, broken migration.

**Implication for future migrations:** `schema.prisma` is the trustworthy source of truth (verified byte-identical to prod as of 2026-09-10). When adding a new migration, generate it normally (`prisma migrate dev`) — the baseline only needed manual reconstruction once, going forward it's an ordinary migration chain. If a `migrate deploy` run ever hits `P3018` on an already-known-correct schema, check whether it's a genuine drift issue or a bookkeeping one (`prisma migrate resolve --applied`/`--rolled-back` as appropriate) before assuming the schema itself is wrong — see git history around 2026-09-10 for a worked example of diagnosing this safely (`migrate diff --from-url <live-db> --to-schema-datamodel` to check for drift before trusting a baseline).

## FTZ Converter — Deterministic Layout Auto-Validation

A validated `InvoiceLayout` (Configuration → Detected layouts) no longer just downgrades future invoices of that fingerprint from Opus to Sonnet-with-hints — it can run with **zero AI calls**, via a generic rule interpreter (`backend/src/converter/parsing/ruleBasedParser.ts`) driven by structured `extractionRules` (`layouts/ruleTypes.ts`) captured once when the layout is first analyzed. Design: `docs/superpowers/specs/2026-09-16-deterministic-layout-validation-design.md`.

- **Auto-validation is conservative by design.** A layout only flips to `validated` with no human step when every *mandatory* field (`FieldDef.designation === 'M'`) and the line-item boundary (`lineAnchor`) came back `confidence: 'high'` from the one-time Opus analysis (`confidenceGate.ts`'s `isEligibleForAutoValidation`). Anything less stays `detected`; the existing manual checkmark still force-validates it if an admin decides the risk is acceptable per-layout. Never relaxed to "gate everything through review" — a wrong `high` means a future invoice silently gets a wrong (not missing) field with no AI check, which is why the bar is per-mandatory-field, not aggregate.
- **`InvoiceLayout.fieldMap` is now a derived rendering, not independent LLM output.** Claude only ever emits `extractionRules`; `describeRule()`/`describeRuleSet()` (`layouts/describeRule.ts`) render it as the same prose the admin UI always showed. Don't ask Claude for both in parallel — that reintroduces the display-vs-behavior drift risk this replaced.
- **A `detected` (unvalidated) layout's hints get reused too**, not just a `validated` one's — `findMatchingDetectedLayout` in `layoutRegistryService.ts` matches by fingerprint against `detected` rows and reuses their `fieldMap` for the cheaper Sonnet extraction path, so a layout that never clears the confidence gate doesn't re-run full Opus analysis (and doesn't accumulate duplicate `detected` rows) on every future invoice — `createLayout` dedupes against an existing `detected` match by updating it in place instead of inserting.
- **Rule DSL** (`column`, `regex` line/bol scope, `literal`, `unresolved`; `lineAnchor` is `singleRow`/`multiRow`/`unresolved`) intentionally only covers what Claude can describe from reading the PDF visually — it never sees `extractCells()`'s x/y coordinates, so a `column` rule carries a header label, not a coordinate; the interpreter resolves that label to an x-band at parse time.
- **Fixed after a real-world miss (2026-09-17):** a `multiRow` chunk originally ran unbounded from one anchor to the next, which on a real multi-page invoice swept a page's reprinted column headers (and everything between the true end of one line and the next page's header) into whichever line's chunk spanned the break — corrupting several fields, not just a cosmetic issue. `splitIntoChunks` now hard-stops a chunk at a page boundary. Same incident also exposed that `findHeaderX` required one exact single-cell match for a `column` rule's header label, when real invoices routinely wrap a multi-word header across several stacked cells/rows (e.g. "TOTAL" / "VALUE" as two cells) — it now clusters header-region cells by x-position and matches on word-order-in-sequence, returning `null` (never guessing) when two clusters match equally well. Both fixes are regression-tested in `tests/ruleBasedParser.test.ts` with synthetic multi-page/wrapped-header fixtures.
- **Known open gap, not yet solved:** on a header with several *closely and unevenly spaced* wrapped multi-word columns (e.g. five adjacent "…VALUE (USD)"-style columns on one real invoice), the gap between a header's own wrapped pieces can be larger than the gap that must stay small enough to avoid merging two genuinely different adjacent columns — so `HEADER_X_CLUSTER_TOLERANCE` (currently 12pt) can't simply be widened without risking a wrong-column match elsewhere. A layout hitting this will keep every mandatory `column`-type field on that header unresolved, which (being mandatory) keeps the *entire* layout on the AI fallback — confirmed against a real invoice, not theoretical. Needs a smarter header-reconstruction approach (e.g. column-width/gap-aware, not fixed-tolerance) before it can be closed.
- No Prisma-mocking test infrastructure exists in this repo — `confidenceGate.ts` and `ruleBasedParser.ts` have full unit coverage (`backend/tests/`), but `layoutRegistryService.ts`'s dedupe/auto-validate DB logic was verified manually (real invoice uploads against local Postgres), not via an automated test.

## Frontend Grid Pattern

Any new paginated table (HTS codes, entries, crossings, line items, etc.)
should follow `docs/patterns/grids.md` — the internal-scroll + sticky
header/footer + "Rows per page" (25/50/75/100) treatment already live on
`/duties/hts`, `/duties/hts/:bucket`, `/dashboard`, and `/entries/:recid`.
It also documents the `sticky-table` CSS class in `src/index.css` and a real
bug it fixes (a descendant selector reaching into a nested drill-down
table's header and overriding its background) — read it before touching
`sticky-table` or building a grid with an expandable/nested row.

## Access Control (RBAC)

Roles: `staff`, `coordinator`, `manager`, `admin`, `broker`. Per-client scoping is via `User.clientCoKeys` (a `TEXT[]` of legacy MSSQL `CO_KEY` values); `getAllowedCoKeys()` returns `null` (unrestricted) for `admin`, `broker`, and `manager` — everyone else is scoped to their own `clientCoKeys` (empty by default; `scripts/create-admin.js` has no way to set it, only role).

- The unrestricted-access check is duplicated in three places by necessity of history: `backend/src/api/entryScope.ts` (shared by `entries.ts`/`htsBreakdown.ts`), and independently in `abi.ts`/`aes.ts`. **`abi.ts` and `aes.ts` now import `getAllowedCoKeys`/`assertCoKeyAllowed`/`parseDate`/`defaultRange` from `entryScope.ts`** (as of 2026-09-10) rather than keeping their own copies — only `appendCoKeyConditions` stays separate in `aes.ts`, since it wraps the column in `RTRIM()` for a padded CHAR column, a genuine behavioral difference from the generic (unpadded) version in `entryScope.ts`. If you add a new role-scoping check anywhere, update `entryScope.ts` and confirm no other route file has its own copy.
- `converterUsers.ts` (the FTZ Converter's Users tab) already lets `coordinator`/`manager` in, but re-checks the caller's **live** DB role (not the JWT, which can be up to 8h stale) before letting them create/edit an `admin`/`manager`/`coordinator`-role account or reset anyone's password — those stay admin-only regardless of route access. Don't assume `requireRole([...])` at the top of a router is the complete picture for that router; check for a second, finer-grained guard like this one.
- `clients.ts` (a *different* "Client" model — tariff-monitoring clients with HTS portfolios/alerts, unrelated to the legacy-MSSQL coKey concept), `alerts.ts`, and `review.ts` are still `admin`/`broker`-only — deliberately not opened up to `manager` (as of 2026-09-10; ask before changing).

## Known Dependency Debt

`npm audit` (as of 2026-09-10, after non-breaking fixes applied):
- **Frontend:** `xlsx` — high severity (prototype pollution + ReDoS), **no fix available upstream**. Needs a replacement library or an accepted-risk decision, not a version bump.
- **Backend:** `nodemailer` (high — SMTP injection/SSRF, actively used in `alerts/emailSender.ts`, needs 6→10), `node-cron` (moderate, used in `pollers/`, needs 3→4), `fast-xml-parser` (moderate, transitive only, needs 4→5), `vitest`/`@vitest/mocker` (moderate, dev-only tooling, never ships to prod). All are major-version bumps requiring individual evaluation, not yet applied.
