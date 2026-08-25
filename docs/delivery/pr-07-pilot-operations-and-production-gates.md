---
id: PR-07-PILOT-OPERATIONS
status: locally_verified
version: 0.2
owner: engineering-and-operations
baseline: e264e53b881d269072fc5de56f7085d15794278b
---

# PR-07 — Pilot operations and production decision gates

Implementation declaration for the PR-07 work package defined in
`docs/delivery/professional-readiness-plan.md`. This document is published
before application behavior changes, per the execution protocol.

## Boundary and recorded decisions

- The boundary is the plan-defined PR-07. The earlier candidate scope
  (re-implementing Slice 008) was refuted; see
  `docs/delivery/pr-07-readiness.md`.
- The product owner instructed on 2026-08-18 to proceed with the full
  plan-defined package while away, as far as open decisions allow. The
  sequencing exception (PR-06 gate open) is recorded there and is not a waiver.
- `ADR-0007` remains proposed. Nothing in this package accepts it, builds
  production infrastructure, or makes production availability, capacity, or
  restore claims. Evidence produced here is local and production-like only.

## implements

Requirement-level scope, with honest acceptance-criterion status:

| Requirement | PR-07 contribution | AC status after this package |
|---|---|---|
| `NFR-04` | `PD-025` load-profile runner and executed run reporting p50/p95/p99 for menu, authenticated reads, and order commands; connected-client delivery measured over SSE | `AC-NFR-04-01`–`04` verified locally against the production-like local stack; production-scale verification pending platform. `AC-NFR-04-05` already implemented by Slice 008 export jobs; not re-implemented. |
| `NFR-05` | Availability gauge/alerts; degraded real-time behavior already implemented (stale/reload) | `AC-NFR-05-03`/`04` existing verified behavior, referenced. `AC-NFR-05-01`/`02` blocked on platform and pilot communication process. |
| `NFR-06` | Load run re-exercises idempotent order/payment retries under profile | `AC-NFR-06-01`–`06` previously verified; re-evidenced under load where applicable. |
| `NFR-07` | Metrics/redaction boundaries; secret-free alert payloads; existing security controls | Previously verified ACs referenced; production security review remains a blocked gate. |
| `NFR-08` | Restore drill validates tenant boundaries on restored data | `AC-NFR-08-01`–`04` re-evidenced through the restore path. |
| `NFR-09` | Retention/privacy policy draft | `AC-NFR-09-05` remains open — proposed draft only; blocked on deployment-market decision. |
| `NFR-10` | Audit retention section in retention draft | `AC-NFR-10-04` remains open — proposed draft only. |
| `NFR-11` | Capacity profile executed | `AC-NFR-11-05` verified locally; production pass pending platform. Other ACs previously verified. |
| `NFR-13` | Metrics for every runbook indicator family; alert evaluation for every critical/high runbook condition that is locally evaluable, with structured routing and an active-alert surface | `AC-NFR-13-03` verified. `AC-NFR-13-04` verified for locally evaluable conditions with local structured routing; external channel routing pending platform. |
| `NFR-14` | Isolated backup/restore drill with RTO measurement and restore validation list from the deployment document | `AC-NFR-14-02` verified locally (isolated environment). `AC-NFR-14-03` RTO verified for the drill path; production RPO 15 min via PITR pending platform. `AC-NFR-14-01`/`04` platform-blocked; drill preserves tenant controls so far as a local run can. |
| `NFR-17` | Supported-browser policy published from approved `AC-NFR-17-02` content | `AC-NFR-17-01` verified (published). `AC-NFR-17-02`/`03` previously implemented/verified. |
| `NFR-18` | Restore drill compares order, payment ledger, and audit evidence between source and restored databases | `AC-NFR-18-01`–`04` re-evidenced through the restore path. |

## obeys

- `docs/operations/observability-and-runbook.md` (approved): indicator
  families, objectives, alert priorities, quarantined-replay procedure.
- `docs/operations/deployment-and-recovery.md` (proposed baseline): process
  model, graceful shutdown, failure table, RPO/RTO, restore validation list.
- `docs/security/threat-model.md`: `THR-003` anomaly metrics, `THR-012`
  redaction, `THR-013` no outbox payloads in telemetry, `THR-014` backup
  exposure controls and restore exercises.
- `PD-025` (load profile), `PD-028` (break-glass), `PD-030` (outbox for
  post-commit work), `PD-032` (append-only financial/audit records).
- `ADR-0001` through `ADR-0006` as accepted; `ADR-0007` remains proposed and is
  not relied upon.
- `docs/architecture/modules.yaml` and
  `docs/architecture/express-implementation-guide.md`: Express only in HTTP
  adapters; no HTTP-to-database-client imports; worker imports no Express;
  routers stay factory-created; side effects only in composition roots.
- AGENTS.md mandatory rules, including: tenant IDs never unbounded metric
  labels; no secrets, session tokens, or outbox payloads in metrics or alerts.

## changes

Application instrumentation (no domain rule, workflow, migration, OpenAPI, or
event-contract changes; no web-client changes):

- `packages/building-blocks` — new `src/observability/`:
  - In-process metrics registry: counters, gauges, and histograms with
    percentile computation and strictly bounded label values.
  - Alert evaluation over registry snapshots implementing the runbook's
    critical/high conditions that are locally evaluable (database unavailable,
    outbox oldest age, quarantine growth, SSE outage, sustained order-submission
    failure), with a pluggable sink routed to structured logs by default and an
    active-alert surface. Alert and metric payloads carry no tenant identifiers
    and no event payloads.
  - Database pool observation hooks (saturation gauges, query-duration
    histogram, error counter) opt-in from `createDatabasePool`.
  - Outbox processor observation callbacks (processed/retry/quarantine
    outcomes, handler duration) and a backlog reader (oldest unprocessed age,
    pending and quarantined counts, per-handler checkpoint age).
  - Idempotency duplicate-hit signal used for the duplicate-prevention rate.
- `packages/modules` — notifications SSE route accepts an optional metrics
  port (open connections, reconnects via `last-event-id`, replay gaps,
  session-ended terminations, delivered items with delivery latency, poll
  failures). Default is a no-op; streaming behavior is unchanged.
- `apps/api` — request metrics middleware using bounded route-pattern, method,
  and status-class labels (covers API latency/availability, order and payment
  command outcomes, authentication failures, rate limits, QR exchange failures,
  and support break-glass activity); readiness observation; a `/health/metrics`
  platform route returning the JSON snapshot (loopback platform surface, not an
  OpenAPI operation, consistent with `/health/live` and `/health/ready`).
- `apps/worker` — metrics wiring for the registry, outbox, and pool; optional
  loopback-only metrics listener using `node:http` (never Express), disabled by
  default and enabled with `WORKER_METRICS_HOST`/`WORKER_METRICS_PORT`.
- `.env.example` — documents the worker metrics listener settings.

Operational tooling and evidence:

- `scripts/load-profile.ts` (+ config and unit tests): executes the `PD-025`
  profile against an isolated, marked, run-scoped PostgreSQL database and
  production-like API/worker builds; provisions the profile dataset; measures
  menu usability, authenticated reads, order commands, and SSE delivery;
  writes p50/p95/p99 JSON and Markdown reports under ignored
  `output/load-profile/`.
- `scripts/drill-restore.ts` (+ config and unit tests): isolated backup/restore
  drill — seeds a marked run-scoped database, backs it up, restores into a
  second fresh database, then validates authentication, tenant isolation, order
  history, payment ledger, audit records, and outbox reconciliation per the
  deployment document; records elapsed times and writes a report under ignored
  `output/drills/`.
- Poison-event replay, worker outage, SSE recovery, session revocation,
  feature disablement, and tenant-isolation drills remain covered by the
  existing outbox integration tests and the PR-05 real-stack journeys; this
  package references them as evidence rather than duplicating them.

Documentation:

- `docs/operations/dashboards/` — portable dashboard definitions for the eight
  required areas (API, order/payment, SSE, outbox/quarantine, projections,
  PostgreSQL, authentication abuse, backups) with a metric-to-indicator map.
- `docs/operations/browser-policy.md` — published supported-browser policy
  restating approved `AC-NFR-17-02` content.
- `docs/operations/retention-and-privacy.md` — proposed draft covering data
  retention (including audit retention) and privacy handling; explicitly
  blocked on the deployment-market decision; not a release claim.
- `docs/operations/pilot/` — owner onboarding, staff quick-start, kitchen and
  cashier quick guides, QR printing guidance, support escalation, maintenance
  communication, and pilot feedback capture (proposed guidance).
- `docs/operations/observability-and-runbook.md` — appendix mapping implemented
  metric names and alert rules to the approved indicators and priorities.
- `docs/delivery/implementation-progress.md`, `docs/index.md`,
  `docs/quality/traceability.yaml` — atomic updates with final evidence.

## tests

- Unit: registry behavior (counters, gauges, histograms, percentiles, bounded
  labels); alert-rule thresholds and priorities; API request-metrics middleware
  (route-pattern bounding, unrouted 404 bucket, no query/tenant data in
  labels); SSE metrics port increments and no-op default; worker config
  listener opt-in parsing; load-profile and restore-drill config safety
  (refuse non-loopback or unmarked databases, fail closed).
- Integration (PostgreSQL): outbox outcome callbacks and backlog reader;
  idempotency duplicate-hit signal; pool observation counters.
- Endpoint: `/health/metrics` returns the snapshot, contains no secrets,
  tokens, tenant identifiers, or event payloads.
- Executed evidence recorded in this document: full non-browser check, browser
  suites, production dependency audit, the load-profile run report, and the
  restore-drill report, all under Node `24.18.0` and pnpm `11.17.0`.

## Explicitly out of scope or blocked

- `ADR-0007` acceptance; hosting vendor/region/budget/data-residency decisions.
- Staging/production infrastructure, managed PostgreSQL PITR, secret
  management, TLS termination, production alert channels and dashboards.
- Production availability, capacity, and restore results; real pilot sessions
  with restaurant participants (PR-06 human-usability gate also remains open).
- Retention/privacy and audit-retention approvals; final product name;
  invitation/recovery delivery channel approval.
- Any change to Slice 008 behavior, PR-06 work, domain workflows, permissions,
  contracts, or migrations.

## Verification plan

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck`
3. `corepack pnpm test` with `TEST_DATABASE_URL` on the pinned toolchain
4. `corepack pnpm test:architecture && corepack pnpm contracts:lint`
5. `corepack pnpm build`
6. `corepack pnpm test:browser`
7. `corepack pnpm audit --prod --audit-level high`
8. `tsx scripts/load-profile.ts` (PD-025 run; report retained under ignored
   output)
9. `tsx scripts/drill-restore.ts` (isolated restore drill; report retained
   under ignored output)

## Status

Declared 2026-08-18. Locally verified 2026-08-25 under Node `24.18.0` and
pnpm `11.17.0`:

1. `corepack pnpm install --frozen-lockfile` — up to date.
2. `format:check`, `lint`, `typecheck` — all pass.
3. `corepack pnpm test` (`TEST_DATABASE_URL` set) — 316 tests across 44 files
   pass, including new registry, alert-rule, request-metrics,
   outbox-observation, and pool-observation coverage.
4. `test:architecture` (188 modules, 370 dependencies, no violations) and
   `contracts:lint` (OpenAPI plus 43 event contracts) — both pass unchanged.
5. `corepack pnpm build` — all packages and apps build.
6. `test:browser:mocked` — 32 tests pass. `test:browser:real` — all 11
   PR-05 real-stack journeys pass unchanged, including worker
   outage/restart backlog drain, SSE offline/online recovery, session
   revocation, and delivered-token recovery completion.
7. `corepack pnpm audit --prod --audit-level high` — no known
   vulnerabilities.
8. `tsx scripts/load-profile.ts` — real run against production-like local
   API/worker builds: 500 dishes, 100 tables, 50 QR sessions seeded; 5
   staff and 50 guest sessions authenticated; 90-second PD-025-paced
   measurement with zero errors — customer-menu-usable p95 22ms (target
   3000ms), staff-authenticated-read p95 20ms (target 500ms),
   order-submission-command p95 52ms (target 1000ms), connected-client
   (SSE) delivery p95 1401ms (target 2000ms). Report retained under
   ignored `output/load-profile/`.
9. `tsx scripts/drill-restore.ts` — real run: two tenants seeded with an
   order, payment, and refund each; backup and restore into a fresh
   isolated database completed in 1078ms total (4-hour RTO target);
   per-tenant row counts for restaurants, users, orders, payments, refunds,
   and audit events matched exactly between source and restored databases;
   the outbox message count matched; no cross-tenant rows were found in
   the restored database. Report retained under ignored `output/drills/`.

Five items remain honestly open and are not resolved by this status: the
`identity.session_invalidation_failures_total`,
`platform.tenant_isolation_signals_total`,
`payments.reconciliation_failures_total`, and
`platform.backup_last_success_age_seconds` counters/gauges are alert-evaluated
but driven only by the restore drill above, not a live production call site;
`reporting.export_failures_total` is defined but not wired at all. All
production-scale, hosting, and real-pilot items remain blocked on `ADR-0007`
and product decisions as declared above. The PR-06 human-usability gate
remains independently open and is not waived by this status.

**Addendum (2026-08-25, same day):** `ADR-0007` is now accepted — see
`docs/architecture/adr/ADR-0007-deployment-platform.md` — but scoped to a
synthetic-data scale/restore validation environment only (Fly.io compute in
Paris, Neon PostgreSQL in Frankfurt). It carries no real customer data. The
business's stated production intent is to self-host locally once a real
client is confirmed; that remains a deferred, separate decision (a future
superseding ADR) and is not resolved by this addendum. This addendum
provisions no staging/production infrastructure and changes no other item
recorded above.
