---
id: ADR-0001
status: accepted
version: 2.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - application-stack
supersedes:
  - ADR-0001-v1-proposed-stack
---

# ADR-0001 — Express and TypeScript Application Stack

## Context

The system needs rapid web-product iteration while preserving strict tenant, payment, workflow, and module boundaries. The customer, staff, and administration clients are web applications, and using TypeScript across clients, API contracts, and server code reduces language and model switching.

## Decision

Use:

- A supported Node.js active-LTS release, pinned during bootstrap.
- Express 5 as the HTTP framework.
- TypeScript with `strict` mode and ECMAScript modules.
- A modular-monolith backend with one Express API process and a separate background-worker process from the same workspace.
- PostgreSQL with versioned migrations.
- React with TypeScript for customer, staff, and administration web applications.
- OpenAPI-described REST/JSON commands and queries.
- Server-Sent Events for MVP server-to-client operational updates.
- Containerized local and production execution.

The package manager, exact supported versions, PostgreSQL client/migration toolkit, runtime validation library, and test runner must be pinned in the bootstrap manifests and lockfile. They must not be selected ad hoc by later feature agents.

## Express constraints

- Express exists only in the HTTP/presentation adapters.
- Domain and application layers must not import `express`.
- Every business module exposes a router factory and explicit application contracts; it never registers global routes as an import side effect.
- Route handlers validate transport input, invoke one application use case, and translate results. They contain no business rules or direct SQL.
- Central middleware owns request context, authentication, tenant resolution, rate limiting, security controls, correlation, and problem responses.
- Cross-module commands use `ServiceWorkflow` and the documented transaction boundary.
- The worker imports application/module contracts without starting an Express server.

Detailed rules and the required workspace layout are authoritative in `docs/architecture/express-implementation-guide.md`.

## Consequences

- One language can be used across web clients, contracts, server code, and most tests.
- Express permits small, mountable module routers without imposing a competing domain architecture.
- Its minimalism requires architecture tests, strict TypeScript, runtime validation, and disciplined composition to prevent route/service sprawl.
- CPU-intensive work must not block the Node.js event loop; it belongs in bounded background work or a separately justified worker implementation.
- Native mobile and offline-first clients remain out of scope.
