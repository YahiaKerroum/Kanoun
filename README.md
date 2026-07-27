# Restaurant Management System

A specification-first, multi-tenant restaurant management and point-of-sale platform for dine-in service. The MVP connects restaurant and branch setup, permission-aware staff access, menu management, table QR ordering, kitchen fulfilment, manually recorded payments, reporting, notifications, and append-only audit history.

## Current implementation status

- Product, domain, security, contract, quality, and architecture baselines are approved.
- `SLICE-001` (`application_bootstrap`) is complete: the executable workspace, migration pipeline, module-boundary checks, API/worker processes, React applications, and CI are present.
- The staff application shell follows `Restaurant POS design system/Mise Staff Shell v2.dc.html`. `design-exploration/` and the older design-system artifacts are retained as history, not implementation authority.
- The next delivery increment is `SLICE-002` (`tenant_branch_and_owner_bootstrap`).
- No restaurant-domain product story is claimed by Slice 001; the visible shell uses honest setup and deferred states until Slice 002 adds protected owner and branch workflows.
- Production infrastructure remains blocked until `ADR-0007` is accepted or superseded.

Progress and limitations are tracked in
[`docs/delivery/implementation-progress.md`](docs/delivery/implementation-progress.md).

## Major capabilities and roles

The MVP supports business owners, restaurant administrators, branch managers, permission-scoped staff, customers using table QR codes, and tightly controlled platform support operators.

Core capabilities include:

- Multiple restaurants and branches within one business-account security tenant.
- Individual, grants-only permissions with branch-scoped access.
- Restaurant menus with branch price, visibility, and availability overrides.
- Temporary guest sessions and table-specific QR ordering.
- Automatic order acceptance and kitchen-display fulfilment.
- Per-order, full-balance cash or card recording without payment processing.
- Operational notifications, dashboards, reports, and sensitive-action audit.

Inventory quantities, reviews, cleaning workflows, online payments, split or partial payments, and dynamic workflows are explicitly outside the MVP.

## Architecture

The system is a modular monolith with one PostgreSQL database and separate API and worker processes from the same workspace. Business modules own their writes. Critical cross-module commands use explicit public contracts and one local transaction through `ServiceWorkflow`; post-commit notifications, reporting, and projections use a transactional outbox with idempotent handlers.

Express is restricted to HTTP adapters. Domain and application code cannot import Express, route handlers cannot contain business rules or SQL, and the worker cannot start the HTTP application.

## Technology stack

- Node.js `24.18.0` and pnpm `11.17.0`
- Express `5.2.1`, strict TypeScript `6.0.3`, Zod `4.4.3`, and ECMAScript modules
- PostgreSQL `18.1`, `pg` `8.22.0`, and Drizzle migrations
- React `19.2.8` and Vite `8.1.5` for customer, staff, and administration web applications
- REST/JSON described by OpenAPI and Server-Sent Events
- Vitest `4.1.10`, Playwright `1.62.0`, dependency-cruiser `18.1.0`, and Redocly `2.41.0`

Every dependency is exact-pinned in a workspace manifest and resolved by the committed lockfile.

## Repository structure

```text
apps/                       Executable API, worker, and React applications
packages/                   Modules, contracts, workflow, database, and test support
migrations/                 Versioned PostgreSQL migrations and Drizzle metadata
tests/                      Cross-workspace architecture tests
scripts/                    Contract validation scripts
docs/                       Normative product, domain, architecture, and quality docs
Restaurant POS design system/
                            Current v2 design source plus superseded supplied artifacts
design-exploration/         Historical design exploration; not implementation authority
restaurant-management-system-requirements.md
restaurant-management-system-architecture.md
```

## Local development

### Prerequisites

- Git
- Node.js `24.18.0`, pinned in `.node-version` and `.nvmrc`
- Corepack with pnpm `11.17.0`, pinned by `packageManager`
- PostgreSQL `18.1`
- Docker only when using the optional containerized database workflow

### Environment

No secret or local environment file is committed. Copy `.env.example` to `.env`,
keep the example local credentials for an isolated development database only,
and replace `SESSION_SECRET` with at least 32 random characters. The API, worker,
and migration configuration load the root `.env` file when it is present;
already-defined process variables take precedence.

### First run

```powershell
corepack enable
corepack prepare pnpm@11.17.0 --activate
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d postgres
corepack pnpm db:migrate
corepack pnpm dev
```

The combined development command starts the API on `http://127.0.0.1:3000`,
the worker, and the MISE staff application on `http://127.0.0.1:5173`.
The staff development server proxies `/health` to the API.

Run individual processes with:

```powershell
corepack pnpm dev:api
corepack pnpm dev:worker
corepack pnpm dev:staff
corepack pnpm --filter @rms/customer-web dev
corepack pnpm --filter @rms/admin-web dev
```

### Verification

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
$env:TEST_DATABASE_URL = "postgresql://rms:rms_local_only@127.0.0.1:5432/rms"
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm contracts:lint
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:browser
corepack pnpm audit --prod --audit-level high
```

`corepack pnpm check` runs formatting, lint, type, unit/integration, architecture,
contract, and production-build verification in one command. PostgreSQL
integration tests run when `TEST_DATABASE_URL` is defined and otherwise report a
skip. CI always supplies it, applies the migration, and runs the complete check.

Stop the optional database with `docker compose down`. Do not add `-v` unless
you explicitly intend to delete the local database volume.

## Documentation

- [Documentation source-of-truth map](docs/index.md)
- [Requirements](restaurant-management-system-requirements.md)
- [Architecture baseline](restaurant-management-system-architecture.md)
- [MVP scope](docs/product/mvp-scope.yaml)
- [Delivery slices](docs/delivery/mvp-slices.yaml)
- [Product decisions](docs/product/decision-register.md)
- [Express implementation guide](docs/architecture/express-implementation-guide.md)
- [Consistency and transactions](docs/architecture/consistency.md)
- [Architecture decisions](docs/architecture/adr/README.md)
- [HTTP contract](docs/contracts/openapi.yaml)
- [Event contract](docs/contracts/events.yaml)
- [Test strategy](docs/quality/test-strategy.md)

## Security

Never commit credentials, tokens, raw session values, private keys, production data, or local `.env` files. Tenant and branch scope must be derived from an authenticated staff session or validated guest session, all external input must be validated, authorization is enforced server-side, and sensitive logs must be redacted.

Please report suspected vulnerabilities privately to the repository owner rather than opening a public issue.

## Contributing

Read [`AGENTS.md`](AGENTS.md) and [`docs/index.md`](docs/index.md) before changing application behavior. Implement only stories marked `mvp` and `ready`, follow the dependency-ordered delivery slices, update contracts and traceability atomically, and use focused conventional commits.
