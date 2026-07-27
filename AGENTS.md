# Restaurant Management System — Agent Guide

## Purpose

This file defines how coding agents must work in this repository. It is normative for agent behavior, not for product behavior.

## Required reading order

Before changing application behavior, read:

1. `docs/index.md`
2. The relevant `US-*`, `AC-*`, and `NFR-*` requirements
3. `docs/product/mvp-scope.yaml`
4. Relevant decisions in `docs/product/decision-register.md`
5. `docs/domain/model.md` and `docs/domain/workflows.yaml`
6. `docs/config/features.yaml` and `docs/security/permissions.yaml`
7. `docs/architecture/modules.yaml` and relevant ADRs
8. `docs/architecture/express-implementation-guide.md`
9. The affected HTTP/event contracts
10. The affected data-model and test-strategy sections

## Source-of-truth rules

- Product outcomes and acceptance criteria: `restaurant-management-system-requirements.md`
- Release inclusion: `docs/product/mvp-scope.yaml`
- Product decisions: `docs/product/decision-register.md`
- State transitions and workflow guards: `docs/domain/workflows.yaml`
- Cross-cutting business invariants: `docs/domain/business-rules.md`
- Feature defaults and dependencies: `docs/config/features.yaml`
- Permission identifiers and scope: `docs/security/permissions.yaml`
- Module ownership and dependencies: `docs/architecture/modules.yaml`
- Technical choices: accepted ADRs in `docs/architecture/adr/`
- HTTP behavior: `docs/contracts/openapi.yaml`
- Event behavior: `docs/contracts/events.yaml`
- Physical database schema: versioned migrations, once code exists
- Verification evidence: automated tests and `docs/quality/traceability.yaml`

No artifact may silently override another artifact that is authoritative for a different topic. If approved sources conflict, stop the affected implementation slice and report the conflicting IDs.

## Current repository state

The repository currently contains specifications and design exploration only. The accepted stack is Node.js active LTS, Express 5, strict TypeScript, PostgreSQL, React, REST, and Server-Sent Events. No executable workspace has been bootstrapped yet. Do not invent build, migration, or test commands. Slice 001 must pin exact versions, create the workspace required by `docs/architecture/express-implementation-guide.md`, and update this section with exact commands.

## Mandatory implementation rules

- Implement only requirements marked `mvp` and `ready` in `docs/product/mvp-scope.yaml`.
- Express is permitted only in HTTP/presentation adapters; domain and application code must not import it.
- Use strict TypeScript and runtime validation for every external input.
- Routers are created by factories and mounted only in the API composition root.
- Route handlers contain no domain rules, direct SQL, or foreign-module infrastructure imports.
- The background worker imports application/module contracts without starting Express.
- Never resolve an open or blocked product decision implicitly.
- Preserve the write ownership defined in `docs/architecture/modules.yaml`.
- A module must not update another module's tables directly.
- Cross-module synchronous work must use an explicit module contract and the consistency mode documented for that use case.
- Persist aggregate changes and their outbox events in the same database transaction.
- Treat payment, refund, correction, audit, and stock-movement records as append-only.
- Derive tenant and branch scope from an authenticated staff session or validated guest session, never from an untrusted identifier alone.
- Recalculate prices and totals on the server.
- Store timestamps in UTC and render them in the branch's IANA time zone.
- Do not log secrets, session tokens, raw credentials, or unnecessary personal data.
- Do not add generic repositories, a message broker, microservices, or a dynamic workflow engine without an accepted ADR.

## Change format

Every implementation task must declare:

- `implements`: `US-*`, `AC-*`, `NFR-*`, and `BR-*` IDs
- `obeys`: applicable `PD-*`, `ADR-*`, `CFG-*`, and `PERM-*` IDs
- `changes`: modules, API operations, events, schema, and UI
- `tests`: happy path, validation, authorization, tenant isolation, concurrency, retry, and failure cases
- `docs`: normative documents that must be updated atomically

## Definition of Done

A change is complete only when:

- Acceptance criteria are met and traceability is updated.
- Server-side authorization and tenant scope are tested.
- State transitions use the canonical workflow definitions.
- API/event contracts and migrations match the implementation.
- Idempotency and concurrency behavior are tested where applicable.
- Sensitive actions emit the required audit record.
- User-visible errors are actionable and do not expose internals.
- Relevant unit, integration, contract, and end-to-end tests pass.
- Documentation contains no new unlinked `TBD`.
