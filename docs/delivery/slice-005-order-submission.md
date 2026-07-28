---
id: SLICE-005-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-28
---

# Slice 005 — Order Submission

## Change declaration

- `implements`: `US-D05`, `US-F05`, `US-G01`, `US-G02`, `US-G03`,
  `US-G04`, `US-G05`, `US-G06`, `US-H02`, `US-H03`; relevant `NFR-01`,
  `NFR-02`, `NFR-03`, `NFR-04`, `NFR-06`, `NFR-07`, `NFR-08`, `NFR-09`,
  `NFR-10`, `NFR-11`, `NFR-12`, `NFR-13`, `NFR-15`, `NFR-16`, `NFR-17`,
  `NFR-18`; and the Slice 004 cross-slice acceptance evidence for immutable
  menu history, the customer note disclaimer and persistence, and operational
  storage of an optional customer display name. Configurable note policy,
  later employee note presentation, and optional-versus-required name
  configuration are not claimed.
- `obeys`: `PD-001`, `PD-003`, `PD-006`, `PD-007`, `PD-008`, `PD-009`,
  `PD-010`, `PD-011`, `PD-013`, `PD-014`, `PD-015`, `PD-018`, `PD-022`,
  `PD-024`, `PD-025`, `PD-026`, `PD-029`, `PD-030`, `PD-033`, `PD-034`,
  `PD-035`, `PD-036`; `ADR-0001`–`ADR-0006`; `CFG-003`, `CFG-004`,
  `CFG-005`, `CFG-006`, `CFG-007`, `CFG-008`, `CFG-013`; `PERM-018`,
  `PERM-019`; `BR-001`, `BR-002`, `BR-003`, `BR-006`, `BR-007`, `BR-008`,
  `BR-009`, `BR-010`, `BR-011`, `BR-012`, `BR-013`, `BR-014`, `BR-019`,
  `BR-021`, `BR-022`, `BR-023`, `BR-024`.
- `changes`: Ordering-owned orders, immutable order items, cancellation
  requests, customer-session order ownership, and branch order-reference
  sequencing; Tables-owned table-session claim/join; Menu-owned transactional
  snapshot resolution; queued Kitchen-owned work creation required by
  automatic acceptance without kitchen processing; scoped idempotency,
  transactional audit and outbox evidence; versioned PostgreSQL migration;
  guest and staff REST operations and event contracts; customer cart, review,
  submission, tracking, and cancellation-request UI; staff order entry and
  active-order view with lifecycle/table/creator/time filters and elapsed time.
- `tests`: guest and staff happy paths; runtime validation and option guards;
  server price recalculation and stale-menu conflicts; authentication,
  permission, feature, tenant, restaurant, branch, table, and guest-order
  isolation; immutable snapshots after menu changes; same-key replay and
  different-payload conflict; concurrent first orders at one table and
  concurrent retries; unique branch references; atomic rollback of orders,
  items, table sessions, kitchen work, audit, idempotency, and outbox;
  customer/staff responsive, keyboard, pending/success/failure/conflict, and
  WCAG A/AA browser behavior.
- `docs`: requirements resolution, product decision register, MVP scope,
  canonical cancellation workflow, module catalogue, consistency model, HTTP
  and event contracts, traceability, implementation progress, documentation
  index, the corrected Slice 004 cross-slice boundary, this declaration, and
  the dated engineering handoff. The existing domain/data models, threat
  controls, and test strategy were reviewed and remain aligned without a
  normative change.

## Approved boundary resolution

`PD-036` preserves `PD-013`: the MVP has no kitchen stations. Slice 005
therefore filters staff orders by lifecycle state, table, creating employee,
and submitted time and displays elapsed time. Station filtering and
urgency/delay classification are not implemented or implied.

## Delivery boundaries

- `US-F04` remains in Slice 007.
- Automatic acceptance may create queued Kitchen-owned work atomically, but
  kitchen queue processing, readiness, serving, and station behavior remain
  Slice 006.
- Notification and reporting consumers remain Slice 008; Slice 005 writes
  only their approved outbox source events.
- Payments, refunds, completion, correction, staff cancellation, bill
  requests, and table-session closure or movement remain in their owning
  later slices.

## Delivered behavior

- A table-scoped guest can build, review, submit, retrieve, and track an order,
  place an additional traceable order in the same open table session, and
  submit one preserved cancellation request.
- An employee with branch-scoped `orders.create` can create an order from the
  current menu and an available or occupied table. An employee with
  branch-scoped `orders.view` can list active orders using the PD-036 filters.
- Submission recalculates current menu prices and option rules on the server,
  persists immutable item and option snapshots, assigns a branch-unique
  reference, and automatically advances approval from Submitted to Accepted.
- The physical table is locked before one open table session is joined or
  created. Concurrent first submissions remain distinct orders in the same
  session and do not expose one guest's order to another guest.
- Order, item, table-session binding, queued Kitchen work, audit, idempotency,
  and outbox evidence commit in one local PostgreSQL transaction.
- Guest and staff command retries use tenant-, actor-, operation-, and
  payload-scoped idempotency. Same-payload retries replay; payload reuse
  conflicts; failed transactions leave no partial order artifacts.
- The customer and staff clients parse responses at runtime, use the
  established cookie/CSRF boundaries, communicate pending/conflict/failure/
  stale states, and keep the critical flows keyboard and WCAG A/AA checked.

## Truthful acceptance boundaries

- `AC-US-D04-03`, immutable note persistence, and the queued Kitchen note
  handoff are verified. `AC-US-D04-01` is not claimed because the later
  employee-facing Kitchen presentation is absent. `AC-US-D04-02` is not
  claimed because configurable free-text note policy is absent.
- `AC-US-E04-03` is verified for operational storage on the scoped session and
  order. `AC-US-E04-01` remains incomplete because the restaurant cannot
  configure optional-versus-required customer names.
- Per-order ownership is preserved for `AC-US-F05-02`, but payment behavior
  remains Slice 007 and is not claimed here.
- Slice 005 emits the transactional events needed by `AC-US-G02-05`;
  notification recipients and delivery remain Slice 008.
- `AC-US-H03-01` and `AC-US-H03-03` are implemented only through the approved
  PD-036 MVP resolution: lifecycle/table/creator/time filters and elapsed time.
  No station filter, urgency threshold, or delayed classification exists.

## Verification evidence

Final verification used Node.js `24.18.0`, pnpm `11.17.0`, and a separate
PostgreSQL `18.1` cluster initialized from empty at
`postgresql://rms@127.0.0.1:55435/rms_final`:

- `corepack pnpm install --frozen-lockfile`: passed with the lockfile already
  current.
- `corepack pnpm db:migrate`: all five migration hashes applied from empty,
  including `0004_order_submission`.
- `corepack pnpm format` and `corepack pnpm format:check`: passed with no file
  changes.
- `corepack pnpm lint` and `corepack pnpm typecheck`: passed.
- PostgreSQL-enabled `corepack pnpm test`: 167 tests passed across 21 files
  with no skips. The first attempt encountered a transient Windows/Node worker
  allocation failure before 45 integration tests ran; the unchanged complete
  rerun passed.
- `corepack pnpm test:architecture`: no dependency violations across 123
  modules and 208 dependencies; all 3 architecture tests passed.
- `corepack pnpm contracts:lint`: OpenAPI validated and all 41 integration
  event contracts passed.
- `corepack pnpm build`: every workspace production build passed.
- `corepack pnpm test:browser`: all 17 Chromium browser/WCAG tests passed.
- `corepack pnpm audit --prod --audit-level high`: no known vulnerabilities.

Slice 005 is verified locally but remains uncommitted and unpublished. No
integration into `main`, push, pull request, or GitHub Actions run is claimed.
