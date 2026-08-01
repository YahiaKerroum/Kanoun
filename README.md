# MISE Restaurant Management System

<p align="center">
  <strong>One calm operating system for the dining room, kitchen, and back office.</strong><br />
  A specification-first, multi-tenant restaurant management and point-of-sale MVP for dine-in service.
</p>

<p align="center">
  <a href="docs/index.md">Documentation</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#verification">Verification</a> ·
  <a href="#contributing">Contributing</a>
</p>

> **MISE is a working product name.** The product name is deliberately not yet
> presented as final branding.

## In the product

| Staff operating view                                                                              | Mobile reporting                                                                        | Administration evidence                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![MISE staff dashboard with current branch activity](docs/assets/screenshots/staff-dashboard.png) | ![MISE sales report at a mobile width](docs/assets/screenshots/staff-report-mobile.png) | ![MISE administration insights with reports and audit evidence](docs/assets/screenshots/admin-insights.png) |

The screenshots are generated from the repository's Playwright visual-review
fixtures. They show representative scoped data, not a customer environment.

## What MISE covers

- Multi-restaurant and multi-branch business accounts with server-enforced
  tenant, restaurant, and branch scope.
- Owner and administrator setup, employee profiles, grants-only permissions,
  branch assignments, and copy-on-apply permission templates.
- Menu, price/availability overrides, tables, QR issue/rotation, and scoped
  guest ordering.
- Kitchen work, whole-order serving, bill requests, manually recorded cash or
  card payments, refunds, corrections, and completion safeguards.
- Durable in-app notifications, dashboard projections, currency-separated
  sales evidence, append-only audit queries, and safe deactivation controls.

The MVP intentionally excludes online payment processing, split/partial
payments, stock control, report exports, currency conversion, external
notification providers, and dynamic workflows. The full approved scope is in
[the MVP slice map](docs/delivery/mvp-slices.yaml).

## Architecture

MISE is a modular monolith backed by PostgreSQL. It runs an Express API and a
background worker as separate processes, plus independent customer, staff, and
administration React applications.

```text
Customer / Staff / Administration React apps
                  │ REST + SSE hints
                  ▼
               Express API
                  │ local transactions + module contracts
                  ▼
        PostgreSQL module-owned tables + outbox
                  │
                  ▼
          Background projection worker
```

Source modules own their writes. Cross-module synchronous commands use explicit
contracts; post-commit notifications, reporting, and audit consumers use the
transactional outbox. The worker never starts Express. Read the
[module map](docs/architecture/modules.yaml),
[consistency rules](docs/architecture/consistency.md), and
[ADR index](docs/architecture/adr/README.md) before changing a boundary.

## Quick start

### Prerequisites

- Node.js `24.18.0`
- Corepack and pnpm `11.17.0`
- PostgreSQL `18.1`, or Docker for the optional local database

Activate the pinned Node version before working:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
node --version # v24.18.0
```

Install and configure an isolated local environment:

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d postgres
corepack pnpm db:migrate
corepack pnpm dev
```

The combined development command starts the API, worker, and staff application.
Use `corepack pnpm dev:api`, `corepack pnpm dev:worker`, or
`corepack pnpm dev:staff` for one process. The customer and administration
applications can be started with their workspace `dev` commands.

Never commit `.env` or replace the example secrets with real credentials.

## Verification

Run the repository checks with the pinned toolchain:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
$env:TEST_DATABASE_URL = "postgresql://rms:rms_local_only@127.0.0.1:5432/rms"
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm contracts:lint
corepack pnpm build
corepack pnpm test:browser
corepack pnpm check
corepack pnpm audit --prod --audit-level high
```

`TEST_DATABASE_URL` is required for the PostgreSQL integration path. CI applies
migrations and supplies it, so database tests must not silently skip there.
The browser suite includes WCAG A/AA automated checks; visual review captures
the staff and administration insights at desktop, tablet, and mobile widths.

## Repository guide

| Need                                     | Start here                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Product behavior and acceptance criteria | [Requirements](restaurant-management-system-requirements.md)                                                                       |
| Scope and product decisions              | [MVP scope](docs/product/mvp-scope.yaml) and [decision register](docs/product/decision-register.md)                                |
| Domain rules and workflows               | [Domain model](docs/domain/model.md), [workflows](docs/domain/workflows.yaml), and [business rules](docs/domain/business-rules.md) |
| HTTP and event contracts                 | [OpenAPI](docs/contracts/openapi.yaml) and [events](docs/contracts/events.yaml)                                                    |
| Test mapping                             | [Traceability](docs/quality/traceability.yaml) and [test strategy](docs/quality/test-strategy.md)                                  |
| All documentation authority              | [Documentation index](docs/index.md)                                                                                               |

## Contributing

Read [AGENTS.md](AGENTS.md) and [the documentation index](docs/index.md)
before changing application behavior. In particular:

1. Work only on `mvp` and `ready` scope, and declare the applicable user
   stories, acceptance criteria, business rules, permissions, and decisions.
2. Keep Express in HTTP adapters, validate external input at boundaries, and
   preserve module write ownership and transactional outbox behavior.
3. Update contracts, migrations, tests, traceability, and the relevant delivery
   declaration together.
4. Use focused conventional commits. Never commit local secrets, test database
   data, or protected agent history.

For a new contributor, the smallest useful first pass is: start the stack,
follow one staff or administration browser test, then trace its API operation
through the contract, module service, migration, and test mapping.
