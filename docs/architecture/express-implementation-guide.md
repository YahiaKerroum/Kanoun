---
id: EXPRESS-IMPLEMENTATION
status: approved
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - express-project-structure
  - express-boundary-rules
  - express-middleware-order
depends_on:
  - ADR-0001
  - MODULE-CATALOG
  - CONSISTENCY-MODEL
---

# Express Implementation Guide

This document makes the modular-monolith architecture concrete for Express and TypeScript. Express is the transport framework, not the application architecture.

Official references:

- [Express routing](https://expressjs.com/en/guide/routing/)
- [Express middleware](https://expressjs.com/en/guide/using-middleware/)
- [Express production practices](https://expressjs.com/en/advanced/best-practice-performance/)

## Required workspace shape

```text
apps/
├── api/
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── composition-root.ts
│       ├── middleware/
│       └── platform-routes/
├── worker/
│   └── src/
│       ├── worker.ts
│       └── composition-root.ts
└── web/
    ├── customer/
    ├── staff/
    └── admin/

packages/
├── modules/
│   ├── identity-access/
│   ├── restaurant-configuration/
│   ├── menu/
│   ├── tables/
│   ├── ordering/
│   ├── kitchen/
│   ├── payments/
│   ├── notifications/
│   ├── reporting/
│   └── audit/
├── service-workflow/
├── building-blocks/
├── contracts/
└── test-support/
```

Each module uses:

```text
module/
├── domain/
├── application/
├── infrastructure/
├── contracts/
├── http/
│   ├── router.ts
│   ├── schemas.ts
│   └── presenters.ts
└── index.ts
```

Physical package count may be consolidated during bootstrap, but import aliases and architecture tests must preserve these logical boundaries.

## TypeScript rules

- Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and consistent casing.
- Use ECMAScript modules.
- Do not use `any` in domain/application code. An exception requires a narrow adapter boundary and explanation.
- Domain identifiers are branded types or value objects rather than interchangeable strings.
- Money uses a decimal-safe representation and is never a JavaScript floating-point calculation.
- Parse unknown external input at the boundary; do not assert request bodies into trusted types.
- Export only intentional module contracts from each module's `index.ts`.

## Express application construction

`app.ts` exports an application factory and does not listen on a port. `server.ts` loads validated configuration, constructs dependencies, starts the HTTP server, and owns graceful shutdown.

Every module exposes a router factory:

```ts
export function createOrderingRouter(deps: OrderingHttpDependencies): Router
```

The composition root creates infrastructure adapters and application handlers, then mounts routers. Importing a module must not:

- Open a database connection.
- Read process environment variables.
- Start a timer or worker.
- Register global middleware.
- Listen on a port.

These side effects belong to the API or worker composition root.

## Middleware and request pipeline

Use this logical order:

1. Explicit proxy/TLS trust configuration.
2. Request and correlation identifiers.
3. Security headers and bounded body parsing.
4. Structured request logging with redaction.
5. Staff or guest session parsing.
6. CSRF/origin protection for cookie-authenticated state changes.
7. Validated tenant, restaurant, branch, and permission context.
8. Global and route-specific rate limits.
9. Module routers.
10. Not-found translation.
11. Central error-to-problem-details middleware.

Public QR exchange applies abuse controls before expensive database work. Authorization is repeated inside the application use case; middleware context is not sufficient on its own.

## Handler contract

An HTTP handler may:

- Parse path, query, headers, and body with the operation schema.
- Read the validated request context.
- Call exactly one application use case or `ServiceWorkflow` command.
- Map the result to the OpenAPI response.

It may not:

- Implement state transitions or financial rules.
- Query or mutate the database directly.
- Import another module's infrastructure.
- Trust client totals, tenant IDs, branch IDs, or status values.
- Catch unexpected failures and return an ad hoc response.

Expected business failures use typed results. Unexpected failures reach the final error middleware, which logs a correlation ID and returns the canonical problem contract.

## Request context

The validated context contains:

```text
requestId
correlationId
actorType
userId or guestSessionId
businessAccountId
restaurantId
authorizedBranchScopes
branchScopedPermissions
sessionVersion
```

Tenant context is derived from the authenticated session and verified resource ownership. A route parameter never establishes tenant scope.

## Transactions

Transactions are explicit application dependencies. `ServiceWorkflow` starts the local PostgreSQL transaction and passes a transaction context to participating public module contracts.

- A module writes only its owned tables.
- No route starts or commits a business transaction.
- No transaction is stored in a process-global variable.
- External network calls do not occur inside a database transaction.
- Business changes, transactional audit, idempotency, and outbox records commit together where required by the consistency matrix.

## Server-Sent Events

The SSE route:

- Authenticates and authorizes branch scope before streaming.
- Sends event IDs/cursors and periodic heartbeats.
- Cleans up subscriptions when the connection closes.
- Uses bounded per-client buffering and disconnects slow consumers.
- Stops after session revocation.
- Never exposes another tenant's event.
- Tells clients to reload an authoritative snapshot when replay is unavailable.

## Worker process

The worker uses the same application and infrastructure packages without Express. It:

- Claims outbox rows with bounded leases.
- Uses per-handler inbox/checkpoint records.
- Applies retry, quarantine, and replay rules.
- Runs retention, reconciliation, and projection jobs.
- Shuts down gracefully without abandoning claimed work.

## Production requirements

- Disable framework-identifying response headers.
- Configure proxy trust explicitly for the selected deployment.
- Apply request-body size limits per endpoint.
- Never run synchronous CPU- or filesystem-heavy work in request handlers.
- Use process supervision and graceful termination.
- Emit health/readiness signals that distinguish API, database, and worker state.
- Use a reverse proxy/load balancer and central observability in production.

## Architecture tests

CI must fail when:

- `domain` or `application` imports Express.
- One module imports another module's infrastructure or HTTP layer.
- An HTTP handler imports the database client.
- A package imports an internal file instead of the module's public contract.
- API or event schemas drift from their authoritative contracts.
- A router is mounted outside the composition root.

