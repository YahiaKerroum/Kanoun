---
id: SLICE-006-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-28
---

# Slice 006 — Kitchen and Serving

## Change declaration

- `implements`: `US-I01`, `US-I03`, `US-I04`, `US-J01`, `US-J03`; relevant
  `NFR-01`, `NFR-02`, `NFR-03`, `NFR-04`, `NFR-06`, `NFR-07`, `NFR-08`,
  `NFR-09`, `NFR-10`, `NFR-11`, `NFR-12`, `NFR-13`, `NFR-15`, `NFR-16`,
  `NFR-17`, and `NFR-18`.
- `obeys`: `PD-001`, `PD-013`, `PD-014`, `PD-022`, `PD-023`, `PD-024`,
  `PD-025`, `PD-029`, `PD-030`; `ADR-0001`–`ADR-0006`; `CFG-005`,
  `CFG-007`, `CFG-010`, `CFG-013`; `PERM-018`, `PERM-024`, `PERM-027`,
  `PERM-028`; `BR-001`, `BR-002`, `BR-003`, `BR-006`, `BR-007`, `BR-017`,
  `BR-021`, `BR-022`, `BR-023`, `BR-024`.
- `changes`: Kitchen-owned immutable display context, preparation state,
  timestamps, authenticated/effective actors, and versioned transitions;
  Ordering-owned fulfilment projection and serving record; transactional
  audit, outbox, and idempotency; versioned migration; kitchen and serving
  REST operations; grouped staff kitchen and ready-order views with
  authoritative polling, stale disclosure, and reconnect recovery.
- `tests`: queue snapshots and grouping; start/ready/serve happy path;
  all-items-ready derivation; authenticated and loginless effective employees;
  same-command replay and payload/version conflicts; authorization, feature,
  tenant, and branch isolation; invalid transitions; transaction rollback;
  HTTP runtime validation and CSRF; responsive, keyboard, live-status, stale,
  reconnect, and WCAG behavior.
- `docs`: consistency precision, OpenAPI, traceability,
  implementation progress, documentation index, this declaration, and the
  dated final handoff.

## Delivery boundary

- The MVP has no stations, cook assignment, printed tickets, partial
  readiness, partial serving, or delivery assignment.
- Queue items are grouped by order. A whole order becomes ready only when all
  non-cancelled Kitchen work is ready.
- The ready-order workspace is a branch-scoped operational alert backed by
  normal authoritative queries. `ordering.order_ready.v1` is written for
  downstream consumers, but the durable general notification inbox and
  delivery-attempt processing remain Slice 008.
- Collecting an order uses the whole-order `markOrderServed` command. Payments,
  completion, correction, cancellation, and table-session closure remain
  later slices.

## Delivered behavior

- Authorized kitchen employees see order-grouped items with quantity, dish,
  structured options, note, order reference, table, state, and elapsed time.
  New queued items are explicitly labelled.
- Start and ready commands use CSRF, expected versions, scoped idempotency,
  server authorization, and current Kitchen state. They record UTC timestamps,
  the authenticated user, and an optional active branch employee on whose
  behalf the user acts.
- The first start advances the order projection to `preparing`; only the last
  required ready transition advances it to `ready`.
- Ready orders produce a live branch-scoped alert containing order reference
  and table. An employee with `orders.serve` can collect and mark the whole
  order served.
- Serving rechecks authoritative Kitchen readiness and records serving time,
  authenticated user, and effective employee.
- Kitchen, Ordering projection, audit, idempotency, and outbox work commits in
  one local transaction. A failed participant leaves no partial transition.
- The staff client reloads the authoritative queue every two seconds and on
  focus or network reconnect. Failed refreshes preserve the last verified
  state and label it stale.

## Truthful acceptance boundaries

- `AC-US-I01-03` is verified for new queued items. Changed-item presentation
  waits for the Slice 007 correction workflow because correction does not yet
  exist.
- `AC-US-I04-03` and `US-J01` are implemented as the live branch operational
  ready-order alert plus transactional source event. The durable general
  notification inbox remains Slice 008.
- `AC-US-J01-02` is branch-scoped; individual assignment is post-MVP.
- `AC-US-J03-02` is not claimed because partial serving is post-MVP and
  disabled by `PD-014` and `CFG-010`.

## Verification evidence

Final verification used Node.js `24.18.0`, pnpm `11.17.0`, and an isolated
PostgreSQL `18.1` cluster initialized from empty at
`postgresql://rms@127.0.0.1:55436/rms_dev`:

- Frozen install passed with the lockfile already current.
- All six migration hashes applied from empty, including
  `0005_kitchen_and_serving`.
- Formatting, ESLint, and strict TypeScript passed.
- PostgreSQL-enabled tests passed: 173 tests across 22 files with no skips.
- Architecture passed 3 tests with no violations across 128 modules and 224
  dependencies.
- OpenAPI and all 41 integration event contracts validated.
- Every production build passed.
- All 19 Chromium browser/WCAG tests passed. A pre-existing workspace-entry
  opacity animation was removed after it transiently reduced measured text
  contrast during one full-suite run; the affected accessibility case then
  passed twice consecutively and the unchanged complete browser suite passed.
- The production dependency audit reported no known vulnerabilities.
