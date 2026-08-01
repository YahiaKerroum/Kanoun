---
id: IMPLEMENTATION-PROGRESS
status: active
version: 1.0
owner: engineering
last_reviewed: 2026-08-01
---

# Implementation Progress

## Current slice

`SLICE-008 — notifications_reporting_and_audit` (implementation is paused at
the tenth context-compaction checkpoint on its dedicated branch; application
changes have passing preliminary final-suite evidence but the slice is not
complete because visual review, final documentation, cleanup, commit, push, and
remote-ref publication remain unfinished)

## Slice status

- `SLICE-001 — application_bootstrap`: complete.
- `SLICE-002 — tenant_branch_and_owner_bootstrap`: complete.
- `SLICE-003 — employees_permissions_and_configuration`: complete.
- `SLICE-004 — menu_tables_and_qr`: complete and published.
- `SLICE-005 — order_submission`: complete, verified, and integrated into
  `main` as the prerequisite history for Slice 006.
- `SLICE-006 — kitchen_and_serving`: complete and verified on
  `slice-006-kitchen-and-serving`; implementation commit
  `e80e9608f375344903943bbafe5ed384651a65db` and publication follow-up
  `0670c04d1441ef2729ee6263c4736d4571251b2c` are integrated into `main`.
- `SLICE-007 — payment_completion_and_correction`: complete and verified on
  `slice-007-payment-completion-and-correction`; implementation commit
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7` and reviewed publication head
  `db38e98b169375650dadb9534e5ab65567234552` are published to the matching
  remote feature branch and integrated into `main`; the main-publication
  record is published at
  `1a5c265a455a9fa758c5495b3a963570849b9181` and its exact CI passed.
- `SLICE-008 — notifications_reporting_and_audit`: in progress but paused at
  the mandatory tenth context-compaction checkpoint on
  `slice-008-notifications-reporting-and-audit`, based on verified `main` at
  `1a5c265a455a9fa758c5495b3a963570849b9181`. No Slice 008 completion or
  publication claim has been completed.

## Completed

- Approved product and architecture documentation baseline.
- Exact runtime, package-manager, framework, database, migration, and test-tool
  versions pinned with a frozen lockfile.
- Executable API, worker, customer web, staff web, and administration web
  projects created using the approved modular-monolith boundaries.
- Versioned PostgreSQL migration proven against PostgreSQL 18.1 for platform
  idempotency, inbox-checkpoint, and transactional-outbox tables.
- Structured request logging, correlation IDs, security headers, bounded JSON
  input, readiness/liveness endpoints, and canonical problem responses in the
  Express composition root.
- Architecture dependency checks, OpenAPI/event validation, unit/integration
  tests, production builds, dependency audit, and GitHub CI.
- Responsive and accessibility-checked MISE staff shell implemented from
  `Restaurant POS design system/Mise Staff Shell v2.dc.html`.
- Supplied MISE design artifacts preserved in `Restaurant POS design system/`;
  the older artifacts and `design-exploration/` are historical only.
- Repository hygiene baseline: ignore rules, editor settings, line endings, and onboarding README.
- Slice 002 private atomic tenant/owner provisioning, restaurant and branch
  configuration, grants-only authorization, revocable sessions, single-use
  invitation/recovery, transactional audit/outbox, tenant isolation, and
  concurrent final-administrator protection.
- Protected MISE administration sign-in and truthful restaurant/assigned-branch
  context.
- Slice 003 employee profiles without mandatory accounts, delegated branch
  employment, grants-only permission replacement, per-branch scopes,
  copy-on-apply templates, affected-session invalidation, immutable
  configuration versions, permission-aware portal capabilities, and audited
  time-limited support access.
- Responsive MISE employee, permission, and feature administration with fixed
  MVP strategies shown truthfully and WCAG A/AA automation.
- Capability-aware MISE staff navigation that loads the authenticated branch
  boundary and omits destinations unless both the required permission and
  feature are effective.
- Private support inspection limited to the implemented restaurant/branch
  snapshot, with a trusted two-person approval reference, no emergency-policy
  bypass, hashed grant tokens, and immediate token expiry/revocation.
- Slice 004 restaurant-owned menu categories, dishes, structured options,
  fixed-precision prices, branch overrides, physical tables, derived table
  states, QR issue/rotation/revocation, scoped guest sessions, and current
  branch menu browsing.
- Capability-aware staff Menu/Tables workspaces and administration
  Menu/Tables/QR workspaces, including standard-URL QR PNG download, print,
  copy, and revocation behavior.
- Slice 004 server-side permission, feature, tenant, restaurant, and branch
  enforcement with transactional audit/outbox evidence and revoked/unknown QR
  equivalence.
- Slice 005 backend order-submission path: immutable server-priced item
  snapshots, scoped idempotency, branch references, automatic acceptance,
  table-session claim/join concurrency, queued Kitchen-owned work,
  transactional audit/outbox writes, guest cancellation requests, and exact
  permission-scoped staff creation/listing.
- Slice 005 customer cart, review, submission, receipt, progress-refresh, and
  cancellation-request UI.
- Slice 005 staff active-order and order-entry workspace is implemented with
  exact permission gates, approved filters, elapsed time, runtime validation,
  CSRF, and idempotency. The React 19 event-lifetime defect was fixed across
  seven filter callbacks and analogous callbacks were audited.
- Visual review found and fixed stale dish option controls after adding a
  draft item. The staff list, filters, and order-entry dialog were then
  inspected at desktop and narrow widths.
- Final isolated PostgreSQL 18.1 verification applied all five migrations from
  empty and passed 167 tests across 21 files, architecture checks across 123
  modules and 208 dependencies, OpenAPI and 41 event contracts, all production
  builds, all 17 browser/WCAG tests, formatting, lint, strict TypeScript, and
  the production dependency audit.
- `PD-036` preserves the no-stations MVP strategy while defining the approved
  active-order filters and elapsed-time presentation.
- Slice 006 Kitchen-owned display snapshots and versioned queued/preparing/
  ready transitions, including UTC times and authenticated/effective actors.
- Slice 006 first-start and all-items-ready Ordering projections, authoritative
  whole-order serving guard, transactional audit/idempotency/outbox behavior,
  and branch-scoped ready-order operational alert.
- Slice 006 grouped staff kitchen display with item options, notes, elapsed
  time, explicit new-state label, ready-order collection, two-second
  authoritative refresh, stale-state preservation, and reconnect recovery.
- Final isolated PostgreSQL 18.1 verification applied all six migrations from
  empty and passed 173 tests across 22 files, architecture checks across 128
  modules and 224 dependencies, OpenAPI and 41 event contracts, every
  production build, all 19 browser/WCAG tests, formatting, lint, strict
  TypeScript, frozen install, and the production dependency audit.
- Slice 006 implementation commit
  `e80e9608f375344903943bbafe5ed384651a65db` was published to
  `origin/slice-006-kitchen-and-serving` and verified with `git ls-remote`.
- `main` was fast-forwarded to the Slice 006 publication commit
  `0670c04d1441ef2729ee6263c4736d4571251b2c` without history rewriting.
- GitHub Actions run `30442851671` succeeded for that exact integration SHA;
  both `verify` and `dependency-audit` passed.
- The documentation-only Slice 006 main-publication record was committed and
  pushed at `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`.
- GitHub Actions run `30443206834` succeeded for that exact documentation
  commit; both `verify` and `dependency-audit` passed.
- Slice 007 whole-session table movement; append-only order correction,
  payment, and refund history; bill-request operations; reasoned cancellation;
  served/paid and critical unpaid completion; guarded table-session closure;
  customer/staff experiences; and transactional audit/idempotency/outbox
  behavior.
- Final Slice 007 verification applied all seven migrations from empty
  PostgreSQL 18.1 and passed 189 tests across 24 files, architecture checks
  across 136 modules and 247 dependencies, OpenAPI and 42 event contracts, all
  production builds, all 23 browser/WCAG tests, frozen installation,
  formatting, lint, strict TypeScript, and the production dependency audit.
- Responsive traced states for customer bill requests, the staff
  payment/refund desk, correction retry, and whole-session movement were
  visually inspected after the complete browser suite passed.
- Slice 007 implementation commit
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7` was published to
  `origin/slice-007-payment-completion-and-correction` and verified with
  `git ls-remote`.
- Slice 007 publication preparation was committed at
  `db38e98b169375650dadb9534e5ab65567234552`; the local and remote feature
  refs were verified independently.
- `main` was fast-forwarded without history rewriting from
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f` to
  `db38e98b169375650dadb9534e5ab65567234552`, pushed normally, and verified
  independently against `origin/main`.
- GitHub Actions run `30456268068` succeeded for the exact Slice 007
  integration SHA; both `verify` and `dependency-audit` passed.
- The documentation-only Slice 007 main-publication record was committed and
  pushed at `1a5c265a455a9fa758c5495b3a963570849b9181`.
- GitHub Actions run `30456680467` succeeded for that exact documentation
  commit; both `verify` and `dependency-audit` passed.
- The Slice 008 branch was created from the verified, up-to-date `main` at
  `1a5c265a455a9fa758c5495b3a963570849b9181`.
- The complete Slice 008 normative review was performed and found no approved
  source conflict. In particular, the dashboard boundary may expose elapsed
  time but must not classify an item as delayed or invent a threshold under
  `PD-036`.
- The planned Slice 008 change declaration was created at
  `docs/delivery/slice-008-notifications-reporting-and-audit.md` before
  application behavior was changed.

## In progress

- Slice 008 is verified locally on Node `v24.18.0`, pnpm `11.17.0`, and
  isolated PostgreSQL 18.1. The final application verification passed frozen
  installation, formatting, lint, strict typecheck, 207 PostgreSQL-backed
  tests across 28 files, 154-module/295-dependency architecture checks, 43
  event contracts, production build, full check, and production dependency
  audit. The final browser/WCAG suite passed 25 Playwright tests.
- Responsive visual review at desktop (1440px), tablet (1024px), and mobile
  (390px) covered the staff dashboard, inbox, report, audit workspace, and
  administration evidence workspace. It added keyboard-focusable report
  scrolling, a visible scroll instruction, accurate underlying-order wording,
  and responsive administration action styling. Publication of the feature
  branch remains the final delivery step.
- Context compacted a tenth time after the ninth-continuation reconciliation,
  a lint-only test fix, isolated PostgreSQL migration verification, and the
  repository command suite. Work stopped under the mandatory compaction rule.
  No implementation, testing, staging, commit, push, cleanup, or publication
  action was performed after compaction; only read-only state capture and
  checkpoint documentation followed.
- The only source change made after checkpoint-9 was in
  `packages/modules/src/notifications/application/notification-service.test.ts`:
  a Vitest mock was returned from `setup()` so assertions no longer reference
  an unbound method. The current SHA-256 is
  `79719EBC692EF781ADA5978AC9CFB38ED20BA8DF62BB114E020CB58B22C90AE4`.
- Preliminary verification before the tenth compaction, using Node
  `v24.18.0`, pnpm `11.17.0`, and isolated PostgreSQL 18.1 on
  `127.0.0.1:55437`, passed: frozen install, format check after the test-file
  formatting repair, lint, typecheck, PostgreSQL-backed test suite (28 files,
  207 tests), architecture tests (154 modules, 295 dependencies, 3 tests),
  contract lint (OpenAPI plus 43 event contracts), production build, browser
  suite (23 tests), full `corepack pnpm check`, and production dependency
  audit. The browser run emitted Vite proxy `ECONNREFUSED 127.0.0.1:3000`
  lines while still passing.
- The isolated database `rms_slice008_verify` currently contains eight
  migrations. Migration 8 hash is
  `d46aaa5da066193d1f8ae445873e1c0ef730496486c268b76d6ca1705ee0d89c`,
  matching `migrations/0007_notifications_reporting_and_audit.sql`.
- Tenth-checkpoint read-only capture confirmed the expected branch, `HEAD`,
  local `main`, and `origin/main` all at
  `1a5c265a455a9fa758c5495b3a963570849b9181`; no staged paths; no remote
  Slice 008 ref; protected `.cc-history` hashes unchanged; unrelated
  PostgreSQL still listening on `5432`; isolated PostgreSQL running on
  `127.0.0.1:55437` with parent PID `23624`; and no Slice 008 verification
  command in flight.
- Remaining before completion: resume from the tenth continuation prompt,
  reread required sources from disk, perform responsive/WCAG visual review and
  manual inspection, refresh the root README into a professional GitHub-facing
  project guide with logo/branding, screenshots, setup, architecture, feature,
  verification, and contribution guidance, finalize Slice 008 docs and
  traceability, re-run any verification invalidated by final edits, cleanly
  stop or account for the isolated PostgreSQL cluster without touching port
  `5432`, review the full diff/status/protected paths, stage only Slice 008
  files including the README refresh, commit, push only the matching Slice 008
  branch, independently verify the remote ref, and record publication
  evidence. Do not open a pull request or integrate into `main`.
- Context compacted a ninth time during mandatory read-only state inspection
  at the start of the ninth continuation. Work stopped immediately upon
  detecting that the worktree does not match the eighth-checkpoint record.
  No application behavior, test, migration, contract, or architecture draft
  was changed. No verification command ran.
- **Detected conflicts (not repaired):** All five key application file hashes
  differ from the eighth-checkpoint record. Seven tracked modified paths not
  listed in the eighth checkpoint are present. The isolated PostgreSQL cluster
  (formerly PID `23876`, port `55437`) is no longer running. The unrelated
  cluster has different PIDs from the eighth checkpoint (now `pg_ctl` `5852`,
  parent `8016`). All of these are consistent with edits made and processes
  restarted after checkpoint-8 was written, before the session ended.
- The extra tracked paths (`docs/architecture/consistency.md`,
  `docs/data/model.md`, `docs/operations/observability-and-runbook.md`,
  `packages/modules/src/restaurant-configuration/http/router.ts`,
  `apps/api/src/restaurant-configuration-routes.test.ts`,
  `apps/web/staff/e2e/shell.spec.ts`, `.env.example`) all carry `7/29/2026`
  last-write timestamps and are Slice 008 edits not captured by the eighth
  compaction document. The `.env.example` now documents the new worker
  settings that checkpoint-8 noted as still missing.
- Read-only capture confirmed Node `v24.18.0`, the expected branch and three
  local refs at `1a5c265a455a9fa758c5495b3a963570849b9181`, nothing staged,
  both protected `.cc-history` hashes correct, no verification command in
  flight, and no remote Slice 008 ref.
- The ninth-compaction actual key file hashes supersede all prior hash records:
  `InsightsAdministration.tsx` `9004DE05...`, `InsightsWorkspaces.tsx`
  `A5DAFDC2...`, migration `0007` `D46AAA5D...`, `outbox-processor.ts`
  `6917A8AE...`, `outbox-processor.integration.test.ts` `A237C9F5...`.
- The following eighth-compaction record is historical context:
- Context compacted an eighth time during the complete draft review, after
  authoritative context reconstruction. Work stopped immediately under the
  mandatory checkpoint rule. Only read-only capture and checkpoint-document
  updates followed; no application behavior changed and no verification
  command ran.
- The migration, outbox, Notifications, Reporting, Audit, Identity Access,
  related source-module/service-workflow edits, API/worker composition, module
  exports, and administration insights component were reviewed. The staff
  insights component, surrounding UI integration/styles and browser patterns,
  and complete final diff were not fully reviewed before compaction.
- Unresolved findings include the restaurant-scoped permission versus
  tenant-wide template-state mismatch, Reporting's undeclared read-only
  source-schema dependency, SSE polling/cursor race risks, incomplete worker
  quarantine/replay operations, missing dedicated module/concurrency tests,
  and administration filter/loading/branch-local-date defects.
- Read-only capture reconfirmed Node `v24.18.0`, the expected branch and three
  local refs at `1a5c265a455a9fa758c5495b3a963570849b9181`, nothing staged,
  protected and key draft hashes unchanged (at the time of checkpoint-8),
  no repository verification command in flight, the unrelated listener on
  `5432`, and isolated PostgreSQL 18.1 PID `23876` on `127.0.0.1:55437`
  with eight migrations.
- The independent remote check at checkpoint-8 succeeded and returned only
  `refs/heads/main`; no remote Slice 008 ref exists.
- No frozen final-worktree verification exists. Earlier formatting,
  typechecking, focused outbox, migration, and baseline database-suite results
  remain preliminary only.
- The following seventh-compaction record is historical context:
- Context compacted a seventh time after the complete authoritative review,
  full draft inspection, and three focused preliminary checks. Work stopped
  immediately under the mandatory checkpoint rule. No application behavior,
  migration, contract, architecture, or test draft was changed in that
  continuation.
- The authoritative reading found no approved-source conflict.
  `AC-US-P01-01` read with `PD-036` still permits elapsed-time presentation
  but forbids delayed/urgent classification or an invented threshold.
- Preliminary `format:check`, `typecheck`, and the focused PostgreSQL-backed
  outbox processor suite passed on the current draft; the focused suite
  reported one file and three passing tests. These are not final evidence.
- The complete draft review identified unresolved permission-template
  deactivation scope, Reporting's read-only source-schema boundary, missing
  dedicated Notifications/Reporting/Audit and concurrency tests, UI
  loading/filter/date/permission issues, worker quarantine/replay
  observability, browser/WCAG/visual evidence, and final documentation.
- The following sixth-compaction record is historical context:
- Context compacted a sixth time while a preliminary combined invocation was
  formatting the repaired Slice 008 drafts, rerunning the new outbox
  integration test, and intending to run lint and typecheck. Work stopped
  immediately under the mandatory checkpoint rule.
- The invocation output was truncated. No matching pnpm, Vitest, ESLint,
  Prettier, or TypeScript process remains, but the exit status and every
  individual subcommand outcome are unknown and must not be treated as
  passing.
- The complete authoritative review had been repeated before the latest
  changes and found no approved-source conflict, including the
  `AC-US-P01-01` and `PD-036` elapsed-time boundary.
- Current unverified work includes migration and guard corrections,
  concurrency-aware branch/template changes, outbox ordering, leasing,
  checkpoints, replay, quarantine and retention, notifications/SSE resume and
  session termination, event-specific reporting projections and APIs,
  tenant/restaurant/branch-scoped audit querying, tightened HTTP contracts,
  API/worker wiring, and responsive staff and administration insights UI
  drafts.
- This continuation added a worker dependency, repaired cursor branch
  ownership and recipient assignment filtering, masked disabled dashboard
  widgets, wired administration audit pagination, derived table-session
  restaurant scope through Restaurant Configuration, explicitly cast outbox
  timestamp parameters, and added a dedicated outbox integration-test draft.
- The administration insights component is now wired into the administration
  app alongside permission-template active-state and deactivation controls.
  The staff and administration insights components gained pagination and
  explicit error/empty/session-ended states. These drafts have not been
  typechecked, browser-tested, or visually inspected on the current worktree.
- The new outbox test covers aggregate ordering and checkpoints, poison-event
  quarantine/replay, and competing-worker claims. Its first run failed on an
  uncast lease-timestamp parameter; the repaired rerun was interrupted and
  its outcome is unknown. Dedicated reporting, notification,
  template-deactivation, and active-work concurrency/scope coverage remains
  incomplete. Architecture/consistency, conceptual data model, traceability,
  and final normative documentation also remain incomplete.
- Preliminary architecture and contract checks passed on earlier worktrees,
  and a repaired preliminary build completed all targets. None verifies the
  current worktree or supplies final Slice 008 evidence.
- No final frozen install, format check, lint, typecheck, complete
  unit/integration, architecture, contract, build, browser/WCAG, full check,
  dependency audit, or visual review has run on the final worktree.
- Nothing is staged. The Slice 008 branch has no upstream and no remote ref.
- Active handoff:
  `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`.
- Active continuation prompt:
  `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-9.md`.
- The original Slice 008 prompt remains the authoritative execution boundary,
  but its already-completed Slice 007 publication and Slice 008 branch-creation
  steps must not be repeated.

## Current limitations

- Customer web has scoped QR exchange, explicit table confirmation, real
  branch menu browsing, and a browser/WCAG-tested cart/order journey.
- Menu and physical-table administration and the staff Orders workspace are
  present and their complete browser/WCAG suite passes. Kitchen processing,
  payment/completion/correction, and bill-request operations are now present;
  durable notification delivery, reporting projections, and audit-query
  screens remain in Slice 008.
- Slice 005 persists item notes and carries them into queued Kitchen work, but
  it does not claim completion of configurable free-text note policy or later
  employee note presentation. Optional customer-name configuration also
  remains incomplete and must not be overstated in final traceability.
- Slice 003 does not claim `AC-US-B01-03` downstream automation or
  `AC-US-C07-02` task proxying. Slice 004 does not claim historical order
  snapshots, note persistence, table assignment, or fabricated occupancy.
- `US-F04` remains assigned to Slice 007 by the approved
  `docs/delivery/mvp-slices.yaml`; older Slice 005 prose must not be used to
  pull it into Slice 004.
- The private support adapter creates no derived support session or real-time
  subscription; expiry and revocation invalidate its direct grant token.
- Local verification requires Node.js 24.18.0; other Node releases are outside
  the supported toolchain even if some commands happen to run.
- Production deployment is blocked by proposed `ADR-0007`.
- `MISE` remains a working product name until product approves a final name.

## Next slice

Resume only from
`docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-8.md`.
Re-establish the required normative context from source, inspect every
unverified edit, and complete Slice 008 without repeating the finished Slice
007 publication or branch-establishment actions. Do not begin another slice.
