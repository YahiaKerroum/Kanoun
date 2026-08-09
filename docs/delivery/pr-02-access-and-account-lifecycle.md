---
id: PR-02-ACCESS-AND-ACCOUNT-LIFECYCLE
status: complete
version: 1.0
owner: engineering
last_reviewed: 2026-08-09
---

# PR-02 implementation declaration: access and account lifecycle

This declaration was published before the PR-02 application edits. It is
subordinate to the approved sources in `docs/index.md`, the product
requirements, and the accepted architecture and workflow decisions.

## implements

- `US-C01`, `US-C06`, `US-C08`
- `US-R01`, `US-R02`, `US-R03`, `US-R04`
- `AC-US-R01-01` through `AC-US-R01-04`
- `AC-US-R02-01` through `AC-US-R02-04`
- `AC-US-R03-01` through `AC-US-R03-04`
- `AC-US-R04-01` through `AC-US-R04-03`
- `NFR-01`, `NFR-03`, `NFR-07`, `NFR-09`, `NFR-13`, `NFR-16`
- `BR-002`, `BR-003`, `BR-004`, `BR-005`, `BR-024`

## obeys

- `PD-004`, `PD-005`, `PD-027`, `PD-028`
- `ADR-0005`
- `CFG-002`, `CFG-015`
- `PERM-006`, `PERM-007`, `PERM-008`
- The canonical `staff_identity` transitions and guards in
  `docs/domain/workflows.yaml`.

## changes

- Add safe, stable Staff and Administration sign-in, recovery, invitation,
  logout, and session-ended routes with internal return-path validation,
  history redaction, runtime validation, and accessible pending/success/error
  states.
- Return the authenticated employee, restaurant, active branch, and effective
  responsibility context from the Identity Access session contract without
  requiring `employees.view` for self identity.
- Enforce CSRF-aware logout, server-side session revocation, truthful
  session-ended handling, and permission-gated cross-workspace links.
- Add Administration employee lifecycle controls for profile editing, branch
  replacement, invitation URL generation, deactivation, reactivation of the
  employee profile, and final-administrator removal/transfer protections.
- Add a loopback-only local recovery delivery/inbox path for the professional
  demo. It keeps delivery tokens in process memory, does not log or retain
  production credentials, and is not a production delivery policy.
- Update the affected Identity Access OpenAPI contract, traceability,
  accessibility/design guidance, local-demo operations notes, and focused
  browser/API/integration evidence.

## tests

- Direct Staff and Administration role entry, safe internal destinations,
  refresh/history/keyboard behavior, signed-out boundaries, and
  permission-gated cross-workspace links.
- Generic recovery responses, validation and rate-limit states, single-use
  invitation/recovery tokens, expiry/used handling, tenant isolation, URL
  history redaction, and secret non-persistence/non-disclosure.
- CSRF-protected logout, server-confirmed revocation, session-ended behavior,
  employee profile/branch validation, deactivation and affected-session
  revocation, invitation conflict handling, and final-administrator guards.
- Responsive browser and accessibility checks at 375px, 768px, and 1280px,
  including automated WCAG assertions and independent visual review.
- Real-stack local demo smoke coverage for owner, general staff, kitchen,
  cashier, recovery, session invalidation, lifecycle controls, and
  cross-workspace visibility.

## docs

- `docs/contracts/openapi.yaml` and `docs/quality/traceability.yaml`.
- `DESIGN.md`, `docs/operations/local-demo.md`, and
  `docs/delivery/implementation-progress.md`.
- This implementation declaration only; no PR-03 scope is included.

## verification evidence

- Node `24.18.0` and pnpm `11.17.0` were used for the final verification.
- Identity HTTP tests passed, including safe self-context; the PostgreSQL
  service-workflow integration suite passed 20 tests with `TEST_DATABASE_URL`.
- OpenAPI/event contract validation passed; Staff and Administration production
  builds passed; the focused PR-02 browser suite passed 5 tests and the full
  browser suite passed 31 tests.
- The real `corepack pnpm dev:demo` stack was exercised on loopback with the
  restricted local PostgreSQL fallback because Docker was unavailable. Role
  entry, effective context, recovery completion with existing-session
  invalidation, logout, employee lifecycle controls, and the loopback recovery
  inbox were observed manually.
- Fresh auth captures at 375px, 768px, and 1280px had no horizontal overflow or
  WCAG violations. The automated browser oracle and an independent visual
  review both returned `PASS`.

## explicit non-goals

- PR-03 employee management and broader product slices.
- Public production owner signup, production credential delivery, or a change
  to the approved recovery delivery policy.
- Implicit reactivation of a disabled login identity: the approved workflow
  keeps employee-profile reactivation separate from credential invitation.
- Message brokers, microservices, generic repositories, dynamic workflow
  engines, or unrelated cleanup of the user-owned working tree.
