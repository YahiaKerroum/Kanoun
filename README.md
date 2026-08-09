# MISE Restaurant Management System

<p align="center">
  <strong>One calm operating system for the dining room, kitchen, and back office.</strong><br />
  A specification-first, multi-tenant restaurant management and point-of-sale MVP for dine-in service.
</p>

<p align="center">
  <img alt="Node.js 24.18.0" src="https://img.shields.io/badge/Node.js-24.18.0-43853d?logo=nodedotjs&logoColor=white" />
  <img alt="pnpm 11.17.0" src="https://img.shields.io/badge/pnpm-11.17.0-f69220?logo=pnpm&logoColor=white" />
  <img alt="TypeScript 6.0.3 strict" src="https://img.shields.io/badge/TypeScript-6.0.3%20strict-3178c6?logo=typescript&logoColor=white" />
  <img alt="PostgreSQL 18.1" src="https://img.shields.io/badge/PostgreSQL-18.1-4169e1?logo=postgresql&logoColor=white" />
  <img alt="React 19.2.8" src="https://img.shields.io/badge/React-19.2.8-149eca?logo=react&logoColor=white" />
</p>

<p align="center">
  <a href="#product-tour">Product tour</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#verification">Verification</a> ·
  <a href="docs/index.md">Documentation</a>
</p>

> [!NOTE]
> **MISE is a working product name.** It is intentionally not presented as
> final product branding. All people, restaurants, orders, and financial data
> shown below are synthetic.

## Overview

MISE models the full dine-in operating loop: administrators configure a
tenant and its branches, guests join a table through a scoped QR code, orders
move through a kitchen-owned workflow, staff record service and payment
outcomes, and managers review durable notifications, sales evidence, and an
append-only audit history.

The repository contains five executable applications in one pnpm workspace:

| Process            | Responsibility                                                                   | Default local address   |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------- |
| Customer web       | QR menu, cart, order tracking, cancellation, and bill requests                   | `http://127.0.0.1:5174` |
| Staff web          | Orders, tables, kitchen, payments, notifications, reports, and audit             | `http://127.0.0.1:5173` |
| Administration web | Tenant setup, people, permissions, features, menus, tables, QR, and evidence     | `http://127.0.0.1:5175` |
| API                | Authenticated REST operations, public guest operations, readiness, and SSE hints | `http://127.0.0.1:3000` |
| Worker             | Transactional-outbox delivery and asynchronous projections                       | Background process      |

The design is intentionally online-first. Browser clients never queue
financial or state-sensitive commands for later replay.

## Product tour

The gallery is generated from browser-tested scenarios. Customer and
data-bearing staff captures use the synthetic Dar Nedjma / Hydra demo model;
capability boundaries, administration, and narrow edge states use deterministic
fixtures against the same contracts. These are rendered product states, not
static mockups.

### Protected administration

![Protected MISE administration sign-in with tenant-scoped access messaging](docs/assets/screenshots/admin-protected-sign-in.png)

Administration starts behind a verified staff session. Business, restaurant,
branch, permission, and feature scope come from server-owned session data, not
from a browser-supplied tenant identifier.

The `/setup` Administration route is the guided owner handoff. Its readiness
checklist is recalculated from fresh server responses and links directly to
restaurant and branch editors, Workforce, features, Menu, and Tables & QR. It
keeps the Staff workspace behind the server-derived core setup gate, so an
owner can refresh or resume the setup URL without a client-side completion flag.

### Guest ordering

#### 1. Browse the current table menu

<p align="center">
  <img alt="Dar Nedjma mobile menu for table T-12" src="docs/assets/screenshots/customer-menu.png" width="390" />
</p>

#### 2. Review the order before submission

<p align="center">
  <img alt="Mobile customer order review for table T-12" src="docs/assets/screenshots/customer-order-review-mobile.png" width="390" />
</p>

#### 3. Track preparation and request service

<p align="center">
  <img alt="Mobile customer order status and service requests" src="docs/assets/screenshots/customer-order-status-mobile.png" width="390" />
</p>

Guests confirm the detected table, browse the current branch-visible menu,
select structured options, and submit through a CSRF-protected guest session.
The server re-prices every item and persists an immutable order snapshot before
automatic MVP acceptance.

### Staff workspace and navigation

| Canonical staff workspace                                                                                                                  | Complete responsive navigation dock                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| ![Staff home workspace with all current MVP destinations and correctly centered access icons](docs/assets/screenshots/staff-workspace.png) | ![Canonical staff navigation showing all eleven current MVP destinations](docs/assets/screenshots/staff-tablet-navigation.png) |

The staff shell renders only destinations allowed by both the employee's
effective grants and the branch's enabled feature set. Hiding a destination is
progressive disclosure; the API still performs authorization for every
protected operation.

Every staff screenshot in this README uses the same synthetic navigation
profile: all current MVP modules are enabled and the employee has the minimum
view or management permission needed to reveal every destination. A scenario
adds only the action grant needed to demonstrate its workflow, such as recording
a payment. This keeps the navigation comparable across images. A real employee
sees only the subset resolved for their active branch and grants. At desktop
widths the destinations form a left rail; at tablet widths they form the
complete horizontal dock shown above; narrower phones can scroll that dock
horizontally.

#### What controls each staff destination

| Destination       | Feature gate                                       | Permission gate                                            | If the feature is off                                                                                                                |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**          | None                                               | Authenticated staff session                                | The capability summary remains the safe landing page.                                                                                |
| **Notifications** | `notifications` (`CFG-013`, branch)                | No additional grant                                        | In-app delivery is hidden; the source operational tasks remain queryable.                                                            |
| **Orders**        | `ordering` (`CFG-005`, branch)                     | Any `orders.*` grant                                       | New orders stop; already-active orders continue under their stored configuration version.                                            |
| **Tables**        | `tables` (`CFG-006`, branch)                       | Any `tables.*` grant                                       | It cannot be disabled while open table sessions exist.                                                                               |
| **Kitchen**       | `kitchen` (`CFG-007`, branch)                      | Any `kitchen.*` grant or `orders.serve`                    | It cannot be disabled while open kitchen work exists.                                                                                |
| **Payments**      | `payments` (`CFG-011`, branch)                     | Any `payments.*` grant                                     | It cannot be disabled while unsettled orders exist.                                                                                  |
| **Menu**          | `menu` (`CFG-003`, restaurant)                     | Any `menu.*` grant                                         | It cannot be disabled while a branch is active; branch price, visibility, and availability overrides remain separately configurable. |
| **Staff**         | `identity_access` (`CFG-002`, restaurant)          | Any `employees.*` grant                                    | This core module cannot be disabled.                                                                                                 |
| **Reports**       | `reporting` (`CFG-014`, restaurant)                | Any `reports.*` grant                                      | Report queries are hidden while existing projections are preserved.                                                                  |
| **Setup**         | `restaurant_configuration` (`CFG-001`, restaurant) | `restaurant.edit`, `branches.manage`, or `features.manage` | This core module cannot be disabled.                                                                                                 |
| **Audit**         | `audit` (`CFG-015`, platform)                      | `audit.view`                                               | This evidence module cannot be disabled.                                                                                             |

Authorized administrators can switch supported features on or off at their
declared restaurant or branch scope. Resolution is deterministic: platform
availability, restaurant configuration, explicit branch override, then workflow
strategy. Dependencies and safe-disable rules are validated, every change is
audited, and the configuration version increments. Existing records continue
under the version stored when they were created. `inventory` (`CFG-016`) is why
**Stock** is absent: it is explicitly post-MVP and currently unavailable.

The authoritative catalogs are
[feature configuration](docs/config/features.yaml) and
[permissions](docs/security/permissions.yaml).

### Service operations

| Branch dashboard                                                                                                  | Active orders                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ![Branch dashboard with operational totals and elapsed-time context](docs/assets/screenshots/staff-dashboard.png) | ![Permission-scoped active-order queue](docs/assets/screenshots/staff-orders.png) |

| Tablet staff order entry                                                                                                                  | Kitchen display                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ![Tablet staff order entry with table, menu option, note, and server-priced review](docs/assets/screenshots/staff-order-entry-tablet.png) | ![Grouped kitchen queue with options, notes, elapsed time, and state controls](docs/assets/screenshots/staff-kitchen.png) |

| Current menu                                                                                                | Derived table availability                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Staff menu with branch-visible dishes and fixed-precision prices](docs/assets/screenshots/staff-menu.png) | ![Staff table view with server-derived availability](docs/assets/screenshots/staff-tables.png) |

| Payment and refund ledger                                                                                        | Durable notifications                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ![Responsive payment ledger with append-only refund evidence](docs/assets/screenshots/staff-payments-mobile.png) | ![Staff notification inbox that survives reconnects](docs/assets/screenshots/staff-notifications.png) |

| Currency-safe sales report                                                                                           | Append-only audit history                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ![Responsive sales report with keyboard-scrollable evidence table](docs/assets/screenshots/staff-reports-mobile.png) | ![Responsive audit history filtered by exact action](docs/assets/screenshots/staff-audit-mobile.png) |

### Back-office configuration

| People, permissions, and features                                                                              | Menu, tables, and QR lifecycle                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ![Administration workforce, permission, and branch configuration](docs/assets/screenshots/admin-workforce.png) | ![Administration menu, physical tables, and issued QR controls](docs/assets/screenshots/admin-menu-tables-qr.png) |

![Administration reports, notifications, and audit evidence](docs/assets/screenshots/admin-insights.png)

## A service from setup to close

1. **Configure the restaurant.** An owner creates restaurants and branches,
   applies operating hours and enabled features, manages employees, and grants
   branch-scoped permissions.
2. **Publish the service surface.** Administrators maintain restaurant-owned
   menus, branch price/availability overrides, physical tables, and rotatable
   table-specific QR codes.
3. **Open a table session.** A guest exchanges a valid QR token for a scoped
   session and explicitly confirms the detected table. Scanning alone does not
   occupy the table.
4. **Accept an order.** Customer or authorized staff submission is idempotent.
   The server verifies table state, menu version, options, and totals, then
   stores immutable item snapshots and queues kitchen work atomically.
5. **Prepare and serve.** Kitchen work moves through queued, preparing, and
   ready states. The MVP serves the whole order only after every item is ready.
6. **Settle and close.** Staff record cash or card payments, append corrections
   or refunds, and complete only served orders with a zero balance unless a
   reasoned privileged override is confirmed. The table session closes only
   after all operational work is resolved.
7. **Review evidence.** Outbox consumers build durable notifications and
   currency-separated reporting projections while sensitive actions remain
   queryable through append-only audit records.

## Capabilities

| Area                     | Included in the MVP                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy and branches     | Multi-restaurant business accounts, branch scope, IANA time zones, overnight hours, dated closures                                                                                      |
| Identity and access      | Owner bootstrap, staff login/logout/recovery, employee profiles without mandatory credentials, grants-only permissions, branch assignments, copy-on-apply templates, revocable sessions |
| Menu and tables          | Restaurant menus, structured options, branch price/visibility/availability overrides, physical tables, derived state, QR issue/rotation/revocation                                      |
| Ordering                 | Scoped guest sessions, customer and staff entry, server-side pricing, immutable snapshots, idempotency, table-session concurrency, cancellation and bill requests                       |
| Kitchen and serving      | Grouped kitchen display, notes/options, queued/preparing/ready workflow, reconnect recovery, whole-order serving                                                                        |
| Payments and corrections | Manual cash/card recording, append-only payments/refunds/corrections, movement of an entire active table session, guarded completion                                                    |
| Operations and evidence  | Durable in-app notifications, branch dashboard, currency-separated sales projections, append-only audit queries                                                                         |

### Deliberate MVP boundaries

MISE does **not** claim online payment processing, split or partial payments,
table-level combined billing, ingredient stock control, printed kitchen
tickets, customer accounts, external notification providers, report export,
currency conversion, offline command replay, dynamic workflow design, or
production deployment readiness. Deployment remains blocked until
[ADR-0007](docs/architecture/adr/ADR-0007-deployment-platform.md) is accepted.

The approved release boundary is authoritative in
[the MVP scope](docs/product/mvp-scope.yaml) and
[slice map](docs/delivery/mvp-slices.yaml). Current implementation and
publication state is tracked separately in
[implementation progress](docs/delivery/implementation-progress.md).

## Architecture

MISE is a modular monolith backed by PostgreSQL. The API and worker are
separate processes, while customer, staff, and administration are independent
React applications.

```mermaid
flowchart TB
  customer[Customer React app]
  staff[Staff React app]
  admin[Administration React app]
  api[Express 5 API composition root]
  modules[Application and domain modules]
  db[(PostgreSQL 18.1)]
  outbox[(Transactional outbox)]
  worker[Background worker]
  projections[Notifications, reports, and audit projections]

  customer -->|REST| api
  staff -->|REST + SSE hints| api
  admin -->|REST| api
  api --> modules
  modules -->|module-owned writes| db
  modules -->|same transaction| outbox
  worker -->|leased delivery| outbox
  worker --> projections
  projections --> db
```

### Architectural guarantees

- Express exists only in HTTP/presentation adapters; domain and application
  code do not import it.
- Every external request and response crosses a Zod runtime-validation
  boundary.
- Each module owns its writes. Synchronous cross-module work uses explicit
  contracts and may share a local transaction only where the approved
  consistency model permits it.
- Aggregate changes and their outbox events commit together.
- Payments, refunds, corrections, audit records, and stock-movement records
  are append-only.
- Tenant and branch scope derives from validated staff or guest sessions.
- Prices and totals are recalculated by the server with fixed-precision
  decimals.
- Timestamps are stored in UTC and rendered in the branch's IANA time zone.

Read the [module map](docs/architecture/modules.yaml),
[consistency rules](docs/architecture/consistency.md), and
[ADR index](docs/architecture/adr/README.md) before changing a boundary.

## Repository map

```text
apps/
  api/                 Express composition root and HTTP adapters
  worker/              Outbox delivery and projection process
  web/customer/        Mobile-first QR ordering application
  web/staff/           Responsive operational workspace
  web/admin/           Restaurant administration application
packages/
  building-blocks/     Shared technical primitives
  contracts/           Contract schemas and shared transport types
  modules/             Domain/application modules and their adapters
  service-workflow/    Cross-module transaction and workflow coordination
  test-support/        Shared test infrastructure
migrations/            Versioned PostgreSQL schema changes
docs/                   Product, domain, architecture, contract, and quality authorities
```

## Technology

| Layer                 | Stack                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Runtime and workspace | Node.js `24.18.0`, pnpm `11.17.0`, Corepack                                   |
| Backend               | Express `5.2.1`, strict TypeScript `6.0.3`, Zod `4.4.3`                       |
| Data                  | PostgreSQL `18.1`, Drizzle migration tooling, fixed-precision monetary values |
| Frontend              | React `19.2.8`, Vite `8.1.5`, three independent applications                  |
| Quality               | Vitest, Playwright, axe-core, dependency-cruiser, Redocly, ESLint, Prettier   |
| Contracts             | OpenAPI for HTTP, YAML event catalogue for outbox/event behavior              |

Versions are intentionally pinned. Do not substitute newer local versions
without an approved, fully verified upgrade.

## Quick start

### Prerequisites

- Node.js `24.18.0`
- Corepack with pnpm `11.17.0`
- Docker, or a compatible local PostgreSQL `18.1` instance

Activate the pinned Node version before installing:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
node --version # v24.18.0
```

Install, configure, migrate, and start the API, worker, and staff application:

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d postgres
corepack pnpm db:migrate
corepack pnpm dev
```

Start one process when working on a focused area:

```powershell
corepack pnpm dev:api
corepack pnpm dev:worker
corepack pnpm dev:staff
corepack pnpm --filter @rms/customer-web dev
corepack pnpm --filter @rms/admin-web dev
```

The API, worker, and migration commands load `.env` when present. Never commit
`.env` or replace example secrets with real credentials.

### One-command professional demo

Copy `.env.example` to `.env` and run the complete local demo:

```powershell
Copy-Item .env.example .env
corepack pnpm dev:demo
```

The command builds the workspace, verifies and safely resets only the explicitly
marked loopback `rms_demo` database, applies all migrations, seeds Dar Nedjma /
Hydra, starts API, worker, customer, staff, and administration, waits for
readiness, and prints a loopback launcher address. The launcher provides four
role entry points, a run-scoped password reveal/copy control, and a real
table-specific customer URL. If Docker is unavailable and the local PostgreSQL
role cannot create databases, the supervisor uses a temporary owned loopback
PostgreSQL 18 cluster and removes it on shutdown.

Use separate browser contexts for each role. To open them automatically with
Playwright, run `corepack pnpm demo:contexts` in another terminal. Stop with
`Ctrl+C`; the supervisor terminates only the processes it started and leaves
the isolated demo database in place. Run `corepack pnpm dev:demo` again to
reset stale data or recover a forgotten password.

The lower-level seed command remains available for focused database work:

```powershell
corepack pnpm db:seed:demo
```

It requires the same explicit demo safety variables, refuses production and
unexpected databases, and creates only synthetic data. See
[`docs/operations/local-demo.md`](docs/operations/local-demo.md) for the
cross-platform Docker/local-PostgreSQL behavior and safety boundary.

## Verification

### Latest verified baseline

The current publication was verified locally on **2026-08-02** with the pinned
Node.js `24.18.0` and pnpm `11.17.0` toolchain. It records **209 passing or
validated automated cases** across the main executable suites:

| Verification surface                | Latest result                                                               |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Unit and module tests               | 138 passed; 1 PostgreSQL-dependent test skipped without `TEST_DATABASE_URL` |
| Architecture                        | 3 passed; 154 modules and 295 dependencies checked with no violations       |
| Contracts                           | OpenAPI valid; 43 integration event contracts validated                     |
| Browser and automated accessibility | 25 passed across customer, staff, and administration critical flows         |
| Strict TypeScript                   | Passed                                                                      |
| Staff production build              | Passed                                                                      |
| Formatting and changed-file linting | Passed                                                                      |

These figures are point-in-time repository evidence, not a hosted CI-status
badge. PostgreSQL integration coverage is enabled separately with the database
environment shown below.

Run the exact repository checks with the pinned toolchain:

| Goal                                      | Command                                         |
| ----------------------------------------- | ----------------------------------------------- |
| Format                                    | `corepack pnpm format:check`                    |
| Lint                                      | `corepack pnpm lint`                            |
| Strict types                              | `corepack pnpm typecheck`                       |
| Unit and PostgreSQL integration tests     | `corepack pnpm test`                            |
| Module-boundary checks                    | `corepack pnpm test:architecture`               |
| OpenAPI and event validation              | `corepack pnpm contracts:lint`                  |
| Production builds                         | `corepack pnpm build`                           |
| Browser and automated accessibility tests | `corepack pnpm test:browser`                    |
| Full non-browser gate                     | `corepack pnpm check`                           |
| Production dependency audit               | `corepack pnpm audit --prod --audit-level high` |

Enable the PostgreSQL integration path locally before `test` or `check`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://rms:rms_local_only@127.0.0.1:5432/rms"
corepack pnpm test
```

CI applies migrations and supplies `TEST_DATABASE_URL`, so integration tests
must not silently skip there. The browser suite exercises critical customer,
staff, and administration flows, includes automated WCAG A/AA checks, and
captures representative desktop, tablet, and mobile states.

## Documentation authority

This repository is specification-first. When documents overlap, use the
authority map below rather than choosing the most convenient prose.

| Question                                | Source of truth                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| What should the product do?             | [Requirements](restaurant-management-system-requirements.md)                                      |
| Is it in the MVP and ready?             | [MVP scope](docs/product/mvp-scope.yaml)                                                          |
| Which product decision applies?         | [Decision register](docs/product/decision-register.md)                                            |
| What states and guards are canonical?   | [Workflows](docs/domain/workflows.yaml) and [business rules](docs/domain/business-rules.md)       |
| Which feature or permission key exists? | [Features](docs/config/features.yaml) and [permissions](docs/security/permissions.yaml)           |
| Which module owns the data?             | [Modules](docs/architecture/modules.yaml)                                                         |
| What is the HTTP or event shape?        | [OpenAPI](docs/contracts/openapi.yaml) and [events](docs/contracts/events.yaml)                   |
| What proves a requirement?              | [Traceability](docs/quality/traceability.yaml) and [test strategy](docs/quality/test-strategy.md) |
| Where is every authority indexed?       | [Documentation index](docs/index.md)                                                              |

## Contributing

Read [AGENTS.md](AGENTS.md) and [the documentation index](docs/index.md)
before changing application behavior.

1. Implement only stories marked `mvp` and `ready`.
2. Declare the applicable `US-*`, `AC-*`, `NFR-*`, `BR-*`, `PD-*`, `ADR-*`,
   `CFG-*`, and `PERM-*` identifiers for the change.
3. Preserve module write ownership, server-side authorization, tenant scope,
   canonical workflows, and transactional outbox behavior.
4. Update contracts, migrations, tests, traceability, and delivery
   documentation atomically when the change affects them.
5. Verify the rendered surface as well as the build. Do not commit secrets,
   local database data, generated test output, or protected agent history.

For a first contribution, start the stack, follow one browser scenario, then
trace its API operation through OpenAPI, the owning module, its migration, and
the matching traceability entry.

## Screenshot provenance

README screenshots are generated from Playwright scenarios at deterministic
viewports. Refresh them only from passing flows, preserve synthetic data, and
review each image for clipping, stale focus, personal data, and responsive
overflow before replacing the checked-in asset.
