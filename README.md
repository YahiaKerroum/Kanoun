# Restaurant Management System

A specification-first, multi-tenant restaurant management and point-of-sale platform for dine-in service. The MVP connects restaurant and branch setup, permission-aware staff access, menu management, table QR ordering, kitchen fulfilment, manually recorded payments, reporting, notifications, and append-only audit history.

## Current implementation status

- Product, domain, security, contract, quality, and architecture baselines are approved.
- The selected application stack is Node.js active LTS, Express 5, strict TypeScript, PostgreSQL, React, REST, and Server-Sent Events.
- The current delivery increment is `SLICE-001` (`application_bootstrap`).
- Executable applications, commands, migrations, and CI are not present in this documentation-baseline commit. They are the next verified increment.
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

Exact versions are pinned during Slice 001.

- Node.js active LTS and pnpm
- Express 5 with strict TypeScript and ECMAScript modules
- PostgreSQL with versioned migrations
- React and Vite for customer, staff, and administration web applications
- REST/JSON described by OpenAPI and Server-Sent Events
- Automated unit, integration, contract, architecture, and browser tests

## Repository structure

```text
apps/                       Executable API, worker, and React applications
packages/                   Business modules and shared application contracts
docs/                       Normative product, domain, architecture, and quality docs
Restaurant POS design system/
                            Supplied implementation design source
design-exploration/         Historical design exploration; not implementation authority
restaurant-management-system-requirements.md
restaurant-management-system-architecture.md
```

The executable `apps/` and `packages/` workspace is created by Slice 001.

## Local development

### Prerequisites

- Git
- The Node.js version pinned in `.nvmrc` after Slice 001
- Corepack with the package-manager version pinned in `package.json`
- PostgreSQL at the version documented after Slice 001
- Docker only when using the optional containerized database workflow

### Environment

No secret or local environment file is committed. Slice 001 adds a safe
`.env.example`; copy it to `.env` and replace placeholders locally.

### Commands

Executable commands are intentionally not invented before the workspace exists.
Slice 001 will add and verify exact commands for:

- Dependency installation
- Local PostgreSQL setup and migrations
- API, worker, and web development
- Formatting and linting
- Type checking
- Unit, integration, contract, architecture, and browser tests
- Production builds

Once verified, the exact command list will be published here and in
[`AGENTS.md`](AGENTS.md).

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
