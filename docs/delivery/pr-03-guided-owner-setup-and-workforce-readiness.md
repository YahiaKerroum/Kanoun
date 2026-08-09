# PR-03 — Guided owner setup and workforce readiness

Status: verified

This declaration scopes the implementation to PR-03 only. PR-04 and PR-05 remain out of scope.

## implements

- `US-A01`, `US-A02`, `US-A04`
- `US-B01`, `US-B03`, `US-B04`
- `US-C01`, `US-C02`, `US-C03`, `US-C04`, `US-C06`
- `US-E01`, `US-F01`
- `AC-US-A01-01` through `AC-US-A01-04`
- `AC-US-A02-01` through `AC-US-A02-04`
- `AC-US-A04-01`, `AC-US-A04-02`
- `AC-NFR-01-04`
- `NFR-01`, `NFR-02`, `NFR-03`, `NFR-07`, `NFR-08`, `NFR-10`, `NFR-13`, `NFR-15`, `NFR-16`
- `BR-001` through `BR-009`, `BR-021`, `BR-024`

## obeys

- `PD-001`, `PD-002`, `PD-003`, `PD-004`, `PD-005`, `PD-007`, `PD-026`, `PD-027`, `PD-035`
- `ADR-0002`, `ADR-0003`, `ADR-0004`, `ADR-0005`, `ADR-0006`
- `CFG-001` through `CFG-008` where applicable
- `PERM-001` through `PERM-017` where applicable
- Canonical restaurant, branch, service-status, table, and QR lifecycle rules

## changes

- Add a stable, permission-aware Administration setup/readiness route with a server-derived resumable checklist, direct editor links, refresh/deep-link/history support, and clear blocked states.
- Complete restaurant and branch list/create/view/edit/activate/deactivate flows with tenant isolation, server-side authorization, confirmation for critical lifecycle changes, audit/history evidence, and optimistic concurrency handling.
- Expose understandable branch hours editing with closed days, overnight periods, dated closure previews where supported, branch time-zone context, and the accepted-orders-after-close warning. Server rules remain authoritative.
- Expose explicit branch service status (`open`, `closed`, `temporarily_unavailable`) with confirmation and explanation, and reflect the result in Customer-facing behavior and readiness.
- Display approved MVP feature states, dependencies, safe-disable behavior, and configuration version truth without inventing unresolved B02 options.
- Integrate the PR-02 workforce/profile/access flows into setup readiness and direct navigation.
- Distinguish menu readiness states for no categories, no dishes, no visible dishes, and ready.
- Distinguish table/QR readiness states for no tables, no active table-ordering QR, active QR, and branch browse-only QR; preserve one-time raw-token handling for issue/rotate/revoke/download/print/preview flows.
- Add a final service-readiness review covering identity/status, branch hours/time zone/currency, workforce, features, menu, tables, QR, direct links, and actionable ready-for-demo/service/blocked outcomes.
- Preserve designed loading, empty, validation, pending, success, conflict, unauthorized, stale/session-ended, server-unavailable, keyboard, focus, reduced-motion, zoom, and responsive states using the existing saffron-frame design authority.

## tests

- Unit tests for hours, overnight/closure acceptance, readiness-state derivation, dependency validation, lifecycle guards, and conflict/error mapping.
- PostgreSQL integration tests for tenant isolation, restaurant/branch lifecycle, hours and service-status persistence, audit/outbox atomicity, feature-version truth, QR token handling, and concurrency.
- Contract tests for changed HTTP behavior and actionable `401`, `403`, `404`, `409`, `422`, and `503` responses.
- Browser/accessibility tests for setup resume/deep links/history, editors, workforce readiness, menu/table/QR states, responsive behavior at the supported baselines, keyboard/focus/error states, and no raw-token leakage.
- Manual real-stack walkthrough using the pinned toolchain, PostgreSQL, API, worker, Customer, Staff, and Administration surfaces.

## docs

- Update `docs/contracts/openapi.yaml` when HTTP behavior changes; update events only when event behavior changes.
- Update `docs/quality/traceability.yaml`, `DESIGN.md`, `README.md`, `docs/index.md`, `docs/delivery/implementation-progress.md`, and `docs/delivery/professional-readiness-plan.md` atomically with affected data, security, operations, and test documentation.

## explicit non-goals

- Do not begin PR-04 or PR-05.
- Do not resolve the documented B02/D04/E04 source conflict implicitly.
- Do not add generic repositories, a message broker, microservices, a dynamic workflow engine, or unrelated product scope.

## verification

- `corepack pnpm check` passed on Node.js `24.18.0`, including formatting, lint, strict typecheck, 35 PostgreSQL-backed test files with 237 passing tests, architecture checks, OpenAPI/event validation, and production builds. The focused service-workflow suite covers six tests, the readiness model covers eight direct state-matrix tests including split-period and selected-restaurant context round trips, the setup API and reload guard cover caller cancellation plus stale/unmounted cleanup, branch acceptance covers explicit order overrides and dated-closure blocking, and the required reason for closed or temporarily unavailable service status is enforced server-side.
- The tracked [`PR-03 verification log`](./pr-03-verification-log.md) preserves the command results and manual surface evidence for this exact implementation slice without recording secrets or raw tokens.
- The committed PR-03 browser/accessibility set passed 31 tests, including the real UI mutation from open to closed with a reason and back to open at desktop and mobile widths. A separate focused real-stack Playwright journey also passed: from the isolated owner launcher it created a restaurant and branch through Administration, opened service with an operational reason, and reached core setup complete. The full multi-role real-stack release suite remains PR-05. The separate untracked `apps/web/staff/e2e/admin-routes.spec.ts` test was user-owned and left untouched; it is not part of this PR-03 evidence. `corepack pnpm audit --prod --audit-level high` reported no known vulnerabilities.
- The pinned real demo stack was walked through with Administration `/setup`, the branch-editor deep link, a reasoned closed-state transition that removed the Staff handoff, restoration to open that exposed the Staff handoff, the live Staff workspace, and the customer table menu. Setup requests returned HTTP 200, the server-derived summary reported core setup complete with one optional browse-only QR item, and the mobile document remained within the viewport while only the section navigation scrolled horizontally.
- Two independent read-only visual reviewers returned `PASS` on fresh 1280x900 and 375x844 PNG captures covering ready, closed, and restored-open states. Temporary demo diagnostics remain outside the commit in ignored local evidence only.
- The final follow-up also makes employee readiness loads permission-aware, scopes the Staff handoff to the selected branch's grants, decomposes the setup route into a data controller, action modules, and focused readiness/restaurant/branch/handoff sections, splits the setup model into typed API, form, readiness, and schema modules plus the hours editor, and documents the `UpdateBranch.reason` contract. Dated closure enforcement remains server-side authoritative. PR-04 and PR-05 remain out of scope.
