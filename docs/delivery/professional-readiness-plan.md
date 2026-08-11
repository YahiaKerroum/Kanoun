---
id: PROFESSIONAL-READINESS-PLAN
status: proposed
version: 1.0
owner: product-engineering-quality
last_reviewed: 2026-08-08
purpose:
  - evidence-backed readiness audit
  - ordered implementation handoff for Luna Max
authority:
  - This document does not change product scope, product decisions, workflows, permissions, contracts, or release claims.
  - Approved sources in docs/index.md remain authoritative.
---

# Professional readiness plan for Luna Max

## Outcome

Move MISE from a feature-complete technical MVP to a product that a restaurant
owner, manager, cashier, kitchen employee, general staff member, and guest can
enter, understand, operate, and verify without SQL, curl, UUID copying, source
inspection, or developer assistance.

This plan deliberately prioritizes usability and trustworthy verification over
new feature breadth. Inventory, reviews, split billing, online payments, extra
dashboards, and other post-MVP capabilities remain out of scope until the
restaurant service journey below passes against the real stack.

## Executive finding

The domain, API, persistence, and role-specific operational surfaces are much
further along than the product entry experience. The largest remaining risk is
not a missing backend capability. It is that existing capabilities cannot be
discovered and exercised as one coherent product.

The immediate release blocker is therefore:

> A non-developer cannot start the complete system, enter each role, open a
> customer QR URL, complete a service, and repeat the check deterministically.

Until that is fixed, visual polish and isolated mocked browser tests can make
the product look more complete than it is.

## Evidence captured on 2026-08-08

| Area | Current evidence | Consequence |
|---|---|---|
| Staff access | The signed-out staff boundary says “Staff access required” but offers no sign-in action. Authentication UI exists only in Administration. | Staff, kitchen, and cashier entry is undiscoverable. |
| Session lifecycle | The API exposes login, logout, recovery, invitation acceptance, and revocation operations. Staff has no login/logout UI; Administration has login but no logout or recovery UI. | Implemented account behavior is not a complete user experience. |
| Administration | Administration can sign in, switch an assigned branch, create an employee profile, change permissions/features, and manage menu/tables/QR. It does not expose restaurant/branch creation and editing, invitation, employee lifecycle, branch assignment, administrator transfer, logout, or recovery. | A first owner cannot configure a restaurant or workforce end to end through the product. |
| Navigation continuity | Administration URL-backed navigation is present in the current worktree and must be verified/integrated, not redesigned. Staff navigation still uses local React state. Staff and Setup may resolve to a deferred “not implemented here yet” screen. | Staff pages cannot be deep-linked, bookmarked, opened in another tab, or restored with browser history. |
| Customer entry | Customer web accepts `/qr/{token}`. Its root has no restaurant/demo entry and renders the invalid-access path. | A valid QR URL is mandatory, but the demo does not provide one. |
| Demo seed | The seed creates four users and useful operational history, but returns unchanged when the demo business already exists, issues no QR codes, and prints neither role credentials nor customer URLs. | Forgotten local credentials or stale data require database knowledge to repair. |
| Local start | `pnpm dev` starts API, worker, and Staff only. Customer and Administration require separate commands. | The documented default does not start the product described in the README. |
| Payment/refund UX | Bill requests can lead into payment, but historical ledger/refund lookup still asks for an order UUID. | A routine correction requires an internal identifier that restaurant staff do not know. |
| Browser verification | There are 26 Playwright tests and 58 API route interceptors. Playwright starts only the three Vite clients, not PostgreSQL, migrations, API, or worker. | These are valuable UI/contract tests, not proof that the integrated product works. |
| Traceability | The 59 ready MVP stories contain 215 acceptance criteria. Thirty criteria are not explicitly listed as verified or cross-slice verified. They are the A01, A02, A04, B02, R01, R02, R03, and R04 criteria. | Release completion is overstated until each criterion has evidence or an approved scope reconciliation. |
| Documentation truth | Slice 008's verified implementation commit is an ancestor of current `main`, but `docs/delivery/implementation-progress.md` and parts of `docs/index.md` still describe it as unintegrated/paused. | Agents cannot safely determine the true starting point. |
| Current local gate | Under Node 22.20.0, strict typecheck passed; lint reported three errors; format check reported 60 files, many of them generated Playwright artifacts. The required Node version is 24.18.0, so this is diagnostic evidence, not a release result. | Luna must establish a clean, pinned-toolchain baseline before attributing failures to new work. |

Relevant implementation locations:

- Staff access and state navigation: `apps/web/staff/src/App.tsx`.
- Administration access and setup surface: `apps/web/admin/src/main.tsx`.
- Customer QR entry: `apps/web/customer/src/App.tsx`.
- Payment lookup: `apps/web/staff/src/PaymentsWorkspace.tsx`.
- Demo seed: `scripts/seed-demo.ts`.
- Browser harness: `playwright.config.ts` and `apps/web/staff/e2e/`.
- Requirement evidence: `docs/quality/traceability.yaml`.

## Source reconciliation required before implementation

Luna Max must not silently resolve these approved-source gaps.

1. `AC-US-B02-02` through `AC-US-B02-06` describe configurable workflow
   options. `docs/product/mvp-scope.yaml` narrows `US-B02` to options enabled in
   `docs/config/features.yaml`; `PD-006`, `PD-013`, `CFG-008`, and `CFG-009`
   fix or defer several of those choices. Product must either approve a precise
   MVP interpretation in traceability or supersede the affected requirement/
   configuration decisions before new configuration controls are built.
2. `AC-US-D04-02` and `AC-US-E04-01` describe configurable free-text notes and
   customer-name policy. Current traceability explicitly marks both incomplete,
   while `PD-006` fixes the MVP customer name as optional. Do not invent a new
   setting without an approved product decision and catalogue entry.
3. `ADR-0007` is proposed. Hosting vendor, region, budget, and data-residency
   choices block production infrastructure and production-ready claims.
4. The initial owner must remain protected by `US-R01` and the private
   bootstrap contract. A public self-service signup is a new product decision,
   not an implied part of the setup UI.
5. Invitation delivery is currently a one-time token returned to an authorized
   administrator; recovery uses a configured delivery adapter. A pilot must
   approve the invitation/recovery delivery channel and customer-facing copy.

## Professional experience standard

Every work package below must meet these standards. Passing a component test
alone is insufficient.

### Discoverability and continuity

- Every protected or empty state gives the user a safe next action.
- Sign-in, sign-out, invitation acceptance, and recovery have stable URLs.
- Every staff and administration destination has a stable URL with browser
  back/forward, refresh, bookmark, new-tab, and deep-link behavior.
- Cross-workspace links preserve a safe internal return path.
- No user-facing screen says “not implemented here yet” for an MVP capability.
- Internal UUIDs are never required for a normal restaurant task.

### Context and role clarity

- The header shows the signed-in employee, active restaurant/branch, and a
  logout action.
- The interface exposes effective responsibilities in plain language without
  presenting fixed job titles as the authorization model.
- A user with multiple responsibilities sees one coherent navigation model.
- Unauthorized and disabled capabilities remain absent from normal navigation;
  the server continues to enforce every permission and scope.

### Operational usability

- Owner, general staff, kitchen, cashier, and manager each land on the first
  useful task for their permissions.
- Orders use one consistent, customer-safe vocabulary for received, waiting for
  kitchen, preparing, ready for service, served, bill requested, paid,
  completed, cancelled, and refunded states.
- State-changing actions visibly distinguish pending, succeeded, failed,
  conflicted, stale, and session-ended states.
- Reconnects reload authoritative state; no financial or state-sensitive
  command is replayed blindly.
- Destructive, permission, payment, refund, and unpaid-completion actions use
  clear confirmation and recovery guidance.

### Design and accessibility

- `DESIGN.md` remains the implementation contract. New primitives and states
  are documented there before use; raw orphan colors, type sizes, spacing, and
  repeated ad hoc patterns are not accepted.
- The current saffron-frame MISE direction is preserved. Existing category
  images and Administration navigation work are verified and integrated rather
  than reopened as new design exploration.
- Critical flows meet WCAG 2.2 AA, complete keyboard operation, visible focus,
  associated labels/errors, non-color status cues, reduced motion, and 200%
  zoom behavior.
- Customer supports 320 CSS pixels upward; Staff supports tablets/laptops from
  768 pixels; Administration meets its 1024-pixel baseline and provides a
  truthful narrow-screen fallback.
- Kitchen item name, quantity, note, elapsed time, state, and order reference
  remain readable at one metre.
- Loading, empty, error, permission-denied, stale, and success states are
  designed states, not generic spinners or blank panels.

### Performance and browser quality

- Production builds are audited in real Playwright-controlled Chrome at mobile
  and desktop sizes. Lighthouse performance, accessibility, best-practices, and
  SEO checks reach 100 for applicable entry routes without removing useful
  content or interaction.
- React Doctor is clean and React Scan reports no unnecessary renders in the
  audited critical journeys.
- Product NFRs remain authoritative: customer menu usable within the NFR-04
  target, routine reads and order/payment commands within their p95 targets,
  and connected updates within two seconds under `PD-025`.
- Critical journeys run in the supported Chrome, Edge, Firefox, and Safari
  policy required by `NFR-17`.

## Definition of the golden restaurant journey

The primary product proof is one service completed in separate role contexts:

1. A controlled operator provisions the initial tenant and verified owner.
2. The owner signs in and completes restaurant, branch, hours, service status,
   default feature, employee, permission, menu, table, and QR setup.
3. A general staff, kitchen, and cashier account accept invitations and sign in
   without using Administration as an authentication workaround.
4. A guest opens a printed or clickable table QR URL, confirms the table,
   browses the current menu, customizes items, and submits an order.
5. General staff sees the submitted order and its table without refreshing an
   unrelated page.
6. Kitchen starts and readies the complete order.
7. General staff sees the ready handoff and marks the order served.
8. The guest requests the bill.
9. The cashier opens that visible bill request, records the full cash/card
   payment, and completes the order without typing an order UUID.
10. The manager sees the sale, notification, table release, and audit evidence.

Manual exit target: a non-developer completes this in 20–30 minutes with no
technical assistance. Automated exit target: the same flow passes against real
PostgreSQL, API, worker, and web clients in CI.

## Ordered work packages

The packages are intentionally sequential. Luna Max must not begin a later
package while an earlier exit gate is red.

### PR-00 — Re-establish a truthful green baseline

**Goal:** make the repository state reliable enough to measure subsequent
product work.

- `implements`: `NFR-12`, documentation governance, existing Slice 008
  completion evidence.
- `obeys`: `ADR-0001` through `ADR-0006`; existing approved slice declarations.
- `changes`:
  - Preserve all user-owned worktree changes. Verify and integrate the existing
    category/image and Administration URL-navigation work; do not redesign it.
  - Reconcile `docs/delivery/implementation-progress.md`, `docs/index.md`, the
    Slice 008 declaration, README claims, and actual `main` history.
  - Activate exactly Node 24.18.0 and pnpm 11.17.0.
  - Keep generated Playwright, temporary, and local output outside format and
    release gates without hiding real source files.
  - Fix current formatting/lint failures and establish a clean `pnpm check`.
- `tests`: frozen install, format check, lint, typecheck, PostgreSQL-backed test,
  architecture, contracts, build, mocked browser suite, production dependency
  audit.
- `docs`: implementation progress, index, affected slice declaration, README,
  traceability only where evidence genuinely changes.
- **Exit:** the pinned-toolchain baseline is green and documentation describes
  the current branch/history without contradiction.

### PR-01 — One-command professional demo environment

**Goal:** make manual multi-role testing safe, repeatable, and non-technical.

**Status (2026-08-09): complete in the current working tree. No PR-02 work is
included.**

- `implements`: `AC-NFR-01-04`, `NFR-06`, `NFR-07`, `NFR-08`, `NFR-13`,
  `BR-001`, `BR-002`, `BR-024`.
- `obeys`: `PD-001`, `PD-006`, `PD-007`, `PD-010`, `PD-013`, `PD-015`,
  `PD-017`, `ADR-0003`, `ADR-0005`, `CFG-001` through `CFG-015` where MVP
  applicable.
- `changes`:
  - Add one documented command, preferably `pnpm dev:demo`, that validates the
    target as a loopback-only, explicitly marked demo database before any reset.
  - Reset only that isolated demo database, apply all migrations, and seed a
    deterministic restaurant with owner, general staff, kitchen, and cashier
    identities using a local-only credential supplied or generated for the run.
  - Issue active table QR codes through the Tables contract and retain raw QR
    tokens only long enough to build local clickable customer URLs.
  - Start PostgreSQL, API, worker, Customer, Staff, Administration, and a small
    local role-launcher page; wait for readiness before presenting links.
  - The launcher shows business code, synthetic role accounts, entry URLs,
    customer QR links, service scenario, reset control, and clear “local demo”
    labeling. Do not write credentials/tokens to application logs or committed
    files.
  - Support deterministic reset when a stale demo already exists. Never reset a
    non-demo database, production environment, or database whose resolved
    target does not pass the safety checks.
  - Offer a documented way to open separate isolated browser profiles/contexts
    for simultaneous owner, staff, kitchen, cashier, and customer windows.
- `tests`:
  - Fresh create and second-run reset.
  - Wrong database name/host, production mode, and missing demo marker fail
    closed without data changes.
  - Four staff accounts can sign in; QR exchange succeeds; launcher URLs resolve;
    API and worker are ready; reset returns the same synthetic scenario.
  - Secrets, raw session tokens, and QR tokens do not appear in logs or git
    status.
- `docs`: README quick start, AGENTS exact commands, `.env.example`, test-data
  guidance, operations note for local demo safety.
- **Exit:** a non-developer runs one command and can enter every role and one
  customer table without SQL, curl, UUIDs, or source inspection.

### PR-02 — Complete access and account lifecycle

**Goal:** make every staff identity enter and leave the correct workspace
without Administration as a workaround.

- `implements`: `US-R01`, `US-R02`, `US-R03`, `US-R04`, `US-C01`, `US-C06`,
  `US-C08`; all 15 currently unlisted R01–R04 acceptance criteria; `NFR-01`,
  `NFR-03`, `NFR-07`, `NFR-09`, `NFR-13`, `NFR-16`.
- `obeys`: `PD-004`, `PD-005`, `PD-027`, `PD-028`, `ADR-0005`, `CFG-002`,
  `CFG-015`, `PERM-006` through `PERM-008`, `BR-002` through `BR-005`,
  `BR-024`, `BR-025`; canonical `staff_identity` workflow transitions.
- `changes`:
  - Add Staff sign-in with a direct action from “Staff access required,” stable
    auth routes, and safe return-to-workspace behavior.
  - Add logout to Staff and Administration and clear expired/revoked sessions
    into an actionable signed-out state.
  - Add request-recovery, complete-recovery, invitation-acceptance, invalid/
    expired/used token, and success states.
  - Show the employee display name, active restaurant/branch, effective
    responsibilities, and logout action. Extend the authenticated session or a
    safe self-profile contract rather than requiring `employees.view` for a user
    to see their own name.
  - In Administration, add invitation issuance with a one-time copyable
    acceptance URL, employee edit/reactivation/deactivation, branch assignment,
    administrator removal/transfer, confirmation, recent-auth recovery, and
    session-revocation messaging.
  - Add clear links between Staff and Administration only when the current
    permissions permit the target.
- `tests`:
  - Happy path, validation, generic authentication errors, rate limit,
    invitation/recovery expiry and single use, logout, revoked session, recent
    authentication, last-administrator concurrency, authorization, branch and
    tenant isolation, keyboard/zoom/accessibility, refresh/deep link.
  - Real-stack tests must prove that deactivation, credential recovery, and
    critical permission removal terminate existing sessions.
- `docs`: OpenAPI only if the self-profile/session response changes;
  traceability for R01–R04; `DESIGN.md` for auth/account primitives; security
  and user-facing support guidance.
- **Exit:** each demo role can sign in directly, understand its context, log
  out, recover access, and respond correctly to revocation.

### PR-03 — Guided owner setup and workforce readiness

**Status (2026-08-11): PR-03 remains verified from its published baseline;
PR-04 and PR-05 are verified for this publication; PR-06 remains out of
scope.**

**Goal:** allow a protected owner to turn a provisioned tenant into a service-
ready restaurant entirely through Administration.

- `implements`: `US-A01`, `US-A02`, `US-A04`, `US-B01`, `US-B03`, `US-B04`,
  `US-C01` through `US-C04`, `US-C06`, `US-E01`, `US-F01`; `AC-US-A01-01`
  through `AC-US-A01-04`, `AC-US-A02-01` through `AC-US-A02-04`,
  `AC-US-A04-01`, `AC-US-A04-02`, and `AC-NFR-01-04`.
- `obeys`: `PD-001` through `PD-005`, `PD-007`, `PD-026`, `PD-027`, `PD-035`,
  `CFG-001` through `CFG-008`, `PERM-001` through `PERM-017`, `BR-001` through
  `BR-009`, `BR-021`.
- `changes`:
  - Add a resumable setup checklist derived from authoritative server state:
    restaurant, branch profile, opening hours/closures, service status,
    features, workforce, permissions, menu, tables, and QR publication.
  - Expose existing create/view/edit/activate/deactivate restaurant operations.
  - Expose create/view/edit branch operations including address, contact, IANA
    time zone, currency, overnight hours, active state, and service status with
    optimistic-concurrency recovery. Dated closure enforcement remains owned by
    the existing server acceptance authority; this slice does not invent a
    closure-editing HTTP contract that is not present in the approved surface.
  - Complete employee profile, branch employment, template, permission,
    invitation, and lifecycle actions from PR-02.
  - Make QR issuance, rotation, revocation, download/print, table identity, and
    customer URL preview understandable to an owner.
  - Provide a final readiness review that links every incomplete item to its
    editor and never implies that a closed/unavailable branch accepts orders.
  - Do not add a public tenant/owner signup. Controlled bootstrap remains the
    entry boundary unless product approves a superseding decision.
- `tests`:
  - Empty provisioned tenant through service-ready branch; validation of time
    zone/currency/hours/overnight periods; deactivation history; unauthorized
    direct URLs; stale versions; last administrator; tenant isolation;
    keyboard/zoom/accessibility; mobile read-only fallback.
  - Explicitly verify every A01, A02, A04 acceptance criterion in traceability.
- `docs`: `DESIGN.md` setup primitives, traceability, setup support guide, any
  changed OpenAPI contracts, affected security/operations/test guidance, and a
  decision record if public signup is desired.
- **Exit:** after controlled owner provisioning, no database/API knowledge is
  required to configure and publish the restaurant.

### PR-04 — Join the operational workspaces into one service

**Status (2026-08-11): implementation verified in the isolated publication
worktree; PR-05 real-stack verification is now complete in its isolated
publication worktree.**

**Goal:** remove navigation and identifier friction from the golden journey.

- `implements`: `US-C08`, `US-E02` through `US-E04`, `US-F02`, `US-G01`
  through `US-G06`, `US-H02` through `US-H05`, `US-I01`, `US-I03`, `US-I04`,
  `US-J01`, `US-J03`, `US-K01` through `US-K04`, `US-O01` through `US-Q02`;
  `NFR-01`, `NFR-02`, `NFR-03`, `NFR-13`, `NFR-16`, `NFR-17`.
- `obeys`: canonical order, kitchen, payment, closure, table-session, QR, and
  bill-request workflows; `PD-006` through `PD-019`, `PD-022`, `PD-023`,
  `PD-029`, `PD-032` through `PD-036`; relevant feature and permission IDs.
- `changes`:
  - Give every Staff workspace a stable URL and preserve current browser-history
    behavior already implemented for Administration.
  - Replace Staff and Setup deferred screens with permission-aware deep links
    to the corresponding Administration pages.
  - Add route-aware role landing behavior: kitchen work for kitchen-only users,
    bill/payment work for cashier-only users, and the operational overview for
    multi-responsibility staff.
  - Link visible orders, bill requests, payments, corrections, cancellations,
    refunds, table moves, and completion actions. Payment/refund history accepts
    route state such as an order reference selected from a visible list; no UUID
    entry is required.
  - Normalize customer/staff handoff language and show the next responsible
    role/action without exposing internal state-machine complexity.
  - Preserve authoritative refresh, stale indicators, SSE recovery, action
    confirmations, and append-only financial/audit evidence.
  - Keep category/image and Administration route work already present; add
    regression coverage rather than reopening those designs.
- `tests`:
  - Deep link, refresh, back/forward, new tab, invalid route, unauthorized route,
    signed-out return path, role landing, customer-safe status, SSE disconnect,
    duplicate action, stale version, state guard, refund/correction history,
    touch/keyboard/zoom, and all defined responsive widths.
- `docs`: `DESIGN.md` navigation/task/status primitives, README product tour,
  traceability for newly observed cross-slice evidence.
- **Exit:** the complete golden journey is manually achievable in separate role
  windows in 20–30 minutes without copying an internal identifier.

### PR-05 — Replace simulated E2E confidence with real-stack proof

**Status (2026-08-11): verified in the isolated PR-05 worktree.**

**Goal:** make “the product works” a reproducible automated release gate.

- `implements`: the seven end-to-end journeys in
  `docs/quality/test-strategy.md`; `NFR-01`, `NFR-03`, `NFR-04`, `NFR-06`,
  `NFR-07`, `NFR-08`, `NFR-12`, `NFR-16`, `NFR-17`, `NFR-18`.
- `obeys`: `ADR-0001` through `ADR-0006`, `PD-025`, module ownership,
  transaction/outbox rules, and all workflow guards exercised by each journey.
- `changes`:
  - Keep the current intercepted Playwright suite, but name and document it as
    UI/contract component coverage, for example `test:browser:mocked`.
  - Add a separate real-stack Playwright configuration and command. It starts
    an isolated PostgreSQL database, applies migrations, creates deterministic
    test data/QR tokens, and starts API, worker, Customer, Staff, and
    Administration production-like builds or previews.
  - Use separate browser contexts for owner, general staff, kitchen, cashier,
    and customer. Do not intercept first-party API calls in this suite.
  - Prove three initial journeys: full setup-to-close service, cancellation plus
    payment/refund history, and tenant/branch/guest isolation. Then cover
    capability disablement with an active order, invitation/recovery/session
    revocation, and worker/SSE recovery.
  - Assert user-visible handoffs and persisted database invariants. Use test
    support code for database evidence; never use database writes to advance a
    user journey that should be possible through the UI/API.
  - Make the real-stack smoke/golden journey the primary product CI gate while
    keeping deeper module/integration coverage in the existing suites.
- `tests`: the work is the test gate; include deterministic retry/idempotency,
  teardown, parallel safety, failure artifact, trace/video/screenshot, and
  prevention of skipped PostgreSQL tests in CI.
- `docs`: test strategy classification, traceability with exact test IDs,
  README verification claims, AGENTS exact commands, CI workflow.
- **Exit:** the golden journey, correction/refund journey, and isolation journey
  pass with zero first-party route interception against the full stack.

### PR-06 — Professional UX, performance, and accessibility gate

**Goal:** turn functional workflows into a coherent product a restaurant can
use throughout service.

- `implements`: `NFR-01` through `NFR-04`, `NFR-13`, `NFR-15` through
  `NFR-17` and `docs/quality/frontend-quality.md`.
- `obeys`: `DESIGN.md`, `PD-024`, `PD-025`, and existing product/workflow
  behavior. Visual work must not change domain rules.
- `changes`:
  - Audit every golden-journey route with owner, general staff, kitchen,
    cashier, manager, and customer walkthroughs.
  - Complete `DESIGN.md` primitives/states for authentication, setup checklist,
    page navigation, identity/context menu, task status, banners, tables,
    confirmations, recovery, empty/error/stale/session-ended states.
  - Add a component/state showcase so mobile/tablet/desktop variants can be
    reviewed before further product screens diverge.
  - Install and development-gate React Grab, React Scan, and React Doctor; none
    may ship in production bundles.
  - Run objective visual QA at 375, 768, and 1280+ pixels, keyboard traversal,
    200% zoom, reduced motion, one-metre kitchen review, and screen-reader
    checks for critical paths.
  - Run production-build Lighthouse and React render audits repeatedly and use
    median results. Fix architecture/assets/rendering causes without removing
    useful content or interaction.
- `tests`: automated axe, keyboard, focus, zoom, contrast, touch-target, live
  update, reduced-motion, responsive overflow, visual regression, Lighthouse,
  React Doctor/Scan, and human usability sessions with restaurant participants.
- `docs`: `DESIGN.md`, frontend quality evidence, visual QA artifacts, accepted
  design/accessibility debt with affected user and repair path.
- **Exit:** all critical routes meet the professional experience standard, no
  Critical/Major accessibility or heuristic issue remains, and five observed
  restaurant users can complete their role journey without facilitator rescue.

### PR-07 — Pilot operations and production decision gates

**Goal:** make a limited real-restaurant pilot supportable and recoverable.

- `implements`: `NFR-04` through `NFR-11`, `NFR-13`, `NFR-14`, `NFR-17`,
  `NFR-18`.
- `obeys`: threat model, observability runbook, deployment/recovery proposal,
  `PD-025`, `PD-028`, `ADR-0003` through `ADR-0007` once accepted.
- `changes`:
  - Product/operations approve hosting vendor, region, data residency, budget,
    pilot support hours, invitation/recovery delivery, retention/privacy policy,
    final product name, and supported-browser policy.
  - Accept or supersede `ADR-0007`; establish isolated staging/production,
    managed PostgreSQL PITR, secret management, TLS, API/worker supervision,
    SSE-compatible routing, migrations, rollback/forward-fix, and environment
    access controls.
  - Instrument the approved service indicators and routed alerts; create
    dashboards for API, order/payment, SSE, outbox/quarantine, projections,
    PostgreSQL, authentication abuse, and backups.
  - Exercise backup restore within RPO 15 minutes/RTO 4 hours, worker outage,
    SSE outage, poison event replay, session revocation, tenant isolation,
    support break-glass, and incident response.
  - Run the `PD-025` load profile and report p50/p95/p99. Fix any release-target
    miss or obtain a time-bound approved exception.
  - Prepare owner onboarding, staff quick-start, kitchen/cashier guides, QR
    printing guidance, support escalation, maintenance communication, and pilot
    feedback capture.
- `tests`: staging golden journeys across supported browsers, security review,
  restore drill, load/capacity, alert routing, deployment rollback/forward-fix,
  secret scan, tenant isolation, and real pilot sessions.
- `docs`: accepted deployment ADR, deployment/recovery runbook, observability
  evidence, browser policy, retention/privacy policy, support/training guides,
  pilot report and accepted risks.
- **Exit:** a named pilot owner accepts the known limits; staging and production
  gates pass; backup/restore, alerts, performance, security, and support are
  demonstrated rather than described.

## Traceability closure list

Luna Max must explicitly close or reconcile these 30 MVP acceptance criteria:

- Restaurant lifecycle: `AC-US-A01-01` through `AC-US-A01-04`.
- Branch lifecycle: `AC-US-A02-01` through `AC-US-A02-04`.
- Branch operating information: `AC-US-A04-01`, `AC-US-A04-02`.
- Workflow configuration: `AC-US-B02-02` through `AC-US-B02-06`.
- Owner bootstrap/invitation: `AC-US-R01-01` through `AC-US-R01-04`.
- Authentication/session revocation: `AC-US-R02-01` through `AC-US-R02-04`.
- Credential recovery: `AC-US-R03-01` through `AC-US-R03-04`.
- Last-administrator protection: `AC-US-R04-01` through `AC-US-R04-03`.

“Implemented in the API” is not closure. Each item needs an exact automated
test ID and, where user-facing, observed UI evidence. The B02 group requires
the approved source reconciliation described earlier before implementation or
verification can be claimed.

## Luna Max execution protocol

For each PR/work package:

1. Re-read the required authoritative sources in `AGENTS.md` order.
2. Publish the package's `implements`, `obeys`, `changes`, `tests`, and `docs`
   declaration before changing behavior.
3. Inspect and preserve all user-owned worktree changes. Never reset, clean, or
   overwrite an unexplained change.
4. Update contracts, migrations, workflow/catalogue references, tests,
   traceability, and normative docs atomically when affected.
5. Verify with the pinned toolchain, real PostgreSQL where applicable, browser
   evidence, and the package exit criterion.
6. Stop on any approved-source conflict rather than choosing a convenient
   interpretation.
7. Do not start the next package while the current package's exit gate is red.

## Final sellable-product gate

The product is ready for a professional pilot only when all statements below
are true:

- A controlled initial owner can finish setup without technical intervention.
- Every staff role can sign in directly, understand its context, and log out.
- A guest can enter through a real QR URL produced by the product.
- The golden journey completes manually in 20–30 minutes and automatically
  against the real stack.
- No normal task requires SQL, curl, a raw UUID, or source inspection.
- All 59 MVP stories and their applicable acceptance criteria have exact,
  truthful traceability.
- Critical accessibility, security, tenant-isolation, payment-integrity, and
  workflow issues are closed.
- Performance, browser, backup/restore, monitoring/alerting, deployment, and
  support gates have observed evidence.
- Remaining limitations are explicit, accepted for the pilot, and do not block
  the core dine-in service.
