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

## Product tour

The gallery covers the actual customer, staff, and administration applications,
using deterministic browser fixtures with synthetic Algerian restaurant data. These are representative
operational states, not mockup artwork or a customer environment.

### Guest ordering

| Current table menu                                                         | Order tracking on mobile                                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ![Customer menu for table T-12](docs/assets/screenshots/customer-menu.png) | ![Customer order status on a mobile screen](docs/assets/screenshots/customer-order-status-mobile.png) |

### Staff operations

| Current branch dashboard                                                                                      |
| ------------------------------------------------------------------------------------------------------------- |
| ![Current branch dashboard with orders, tables, and daily sales](docs/assets/screenshots/staff-dashboard.png) |

| Staff workspace and access                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- |
| ![Staff workspace with explicit availability, permission, and service-control icons](docs/assets/screenshots/staff-workspace.png) |

| Orders                                                                                    | Kitchen                                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ![Staff order queue with filtered active order](docs/assets/screenshots/staff-orders.png) | ![Kitchen preparation queue with a grouped order](docs/assets/screenshots/staff-kitchen.png) |

| Menu                                                                         | Tables                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ![Staff menu view with availability](docs/assets/screenshots/staff-menu.png) | ![Staff table availability view](docs/assets/screenshots/staff-tables.png) |

| Payments and refunds                                                                                     | Notifications                                                                                |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ![Staff payment ledger and refund on a mobile screen](docs/assets/screenshots/staff-payments-mobile.png) | ![Staff notification inbox at tablet width](docs/assets/screenshots/staff-notifications.png) |

| Sales reports                                                                                                               | Audit history                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ![Staff sales report with accessible scrollable evidence table on mobile](docs/assets/screenshots/staff-reports-mobile.png) | ![Staff append-only audit history on a mobile screen](docs/assets/screenshots/staff-audit-mobile.png) |

### Administration

| People and permissions                                                                                          | Menu, tables, and QR lifecycle                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ![Administration workforce, permissions, and branch configuration](docs/assets/screenshots/admin-workforce.png) | ![Administration menu, table, and issued QR code controls](docs/assets/screenshots/admin-menu-tables-qr.png) |

| Reports and audit evidence                                                                             |
| ------------------------------------------------------------------------------------------------------ |
| ![Administration insights with reports and audit evidence](docs/assets/screenshots/admin-insights.png) |

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

To create a fresh local database and populate it with a synthetic Dar Nedjma /
Hydra demo restaurant, choose a local-only demo password and run the setup
command. It starts the repository PostgreSQL service, applies migrations, and
then seeds. The seed also applies pending migrations when PostgreSQL is already
running. It refuses to run in production and is idempotent by business code;
it never runs as part of application startup.

```powershell
$env:DEMO_SEED_PASSWORD = "<local demo password>"
corepack pnpm db:setup:demo
```

The demo includes Algerian staff and customers, menu photography, tables, an
open kitchen order, a paid/refunded order, audit evidence, and worker-derived
notifications and reporting projections. It uses the provided password for
the owner and demo staff accounts without printing it. These are synthetic
records only.

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
