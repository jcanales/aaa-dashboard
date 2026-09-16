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

## Access Control (RBAC)

Roles: `staff`, `coordinator`, `manager`, `admin`, `broker`. Per-client scoping is via `User.clientCoKeys` (a `TEXT[]` of legacy MSSQL `CO_KEY` values); `getAllowedCoKeys()` returns `null` (unrestricted) for `admin`, `broker`, and `manager` — everyone else is scoped to their own `clientCoKeys` (empty by default; `scripts/create-admin.js` has no way to set it, only role).

- The unrestricted-access check is duplicated in three places by necessity of history: `backend/src/api/entryScope.ts` (shared by `entries.ts`/`htsBreakdown.ts`), and independently in `abi.ts`/`aes.ts`. **`abi.ts` and `aes.ts` now import `getAllowedCoKeys`/`assertCoKeyAllowed`/`parseDate`/`defaultRange` from `entryScope.ts`** (as of 2026-09-10) rather than keeping their own copies — only `appendCoKeyConditions` stays separate in `aes.ts`, since it wraps the column in `RTRIM()` for a padded CHAR column, a genuine behavioral difference from the generic (unpadded) version in `entryScope.ts`. If you add a new role-scoping check anywhere, update `entryScope.ts` and confirm no other route file has its own copy.
- `converterUsers.ts` (the FTZ Converter's Users tab) already lets `coordinator`/`manager` in, but re-checks the caller's **live** DB role (not the JWT, which can be up to 8h stale) before letting them create/edit an `admin`/`manager`/`coordinator`-role account or reset anyone's password — those stay admin-only regardless of route access. Don't assume `requireRole([...])` at the top of a router is the complete picture for that router; check for a second, finer-grained guard like this one.
- `clients.ts` (a *different* "Client" model — tariff-monitoring clients with HTS portfolios/alerts, unrelated to the legacy-MSSQL coKey concept), `alerts.ts`, and `review.ts` are still `admin`/`broker`-only — deliberately not opened up to `manager` (as of 2026-09-10; ask before changing).

## Known Dependency Debt

`npm audit` (as of 2026-09-10, after non-breaking fixes applied):
- **Frontend:** `xlsx` — high severity (prototype pollution + ReDoS), **no fix available upstream**. Needs a replacement library or an accepted-risk decision, not a version bump.
- **Backend:** `nodemailer` (high — SMTP injection/SSRF, actively used in `alerts/emailSender.ts`, needs 6→10), `node-cron` (moderate, used in `pollers/`, needs 3→4), `fast-xml-parser` (moderate, transitive only, needs 4→5), `vitest`/`@vitest/mocker` (moderate, dev-only tooling, never ships to prod). All are major-version bumps requiring individual evaluation, not yet applied.
