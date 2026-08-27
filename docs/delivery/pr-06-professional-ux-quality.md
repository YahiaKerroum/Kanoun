---
id: PR-06-PROFESSIONAL-UX-QUALITY
status: blocked
version: 1.0
owner: engineering-and-product
last_reviewed: 2026-08-18
---

# PR-06 — Professional UX, performance, and accessibility gate

## Change declaration

- `implements`: `NFR-01` through `NFR-04`, `NFR-13`, `NFR-15` through
  `NFR-17`, and the frontend-quality policy.
- `obeys`: `DESIGN.md`, `PD-024`, `PD-025`, existing product/workflow
  behavior, and the established module and permission boundaries.
- `changes`: development-only React diagnostics, notification EventSource
  ownership and cleanup verification, cross-browser mocked coverage, focused
  accessibility/keyboard/reduced-motion regressions, and quality evidence.
- `tests`: format, lint, typecheck, React Doctor, architecture and contract
  checks, production builds, diagnostics-exclusion, mocked browser coverage,
  secret scan, and the remaining real-stack, performance, and human gates.
- `docs`: `DESIGN.md`, `README.md`, `AGENTS.md`,
  `docs/quality/frontend-quality.md`, this record, and the documentation index.

## Current evidence — 2026-08-12

Completed after the EventSource cleanup edit:

- Node `24.18.0` and pnpm `11.17.0` are the active verification toolchain.
- The focused notification EventSource/navigation test passes in Chromium,
  Firefox, and WebKit. It verifies one owned connection per mounted workspace,
  listener removal and a single `close()` on navigation, no accumulation across
  repeated navigation, and authoritative reconnect reload behavior.
- The full mocked browser suite passes `99/99` across Chromium, Firefox, and
  WebKit with diagnostics overlays disabled only for automated accessibility
  checks.
- `format:check`, `lint`, `typecheck`, `test:architecture`, `contracts:lint`,
  `build`, diagnostics-exclusion, production dependency audit, and `git diff
  --check` pass.
- A final isolated PostgreSQL run applied migrations from empty and passed all
  37 files / 241 tests with `TEST_DATABASE_URL`; no database-dependent test
  skipped. The run used only an owned loopback PostgreSQL cluster and removed it
  after completion.
- React Doctor reports `0` errors and 87 warnings. Every warning group is
  classified in `docs/quality/frontend-quality.md`; none is described as clean
  or waived.
- The fallback secret scan found no credential signatures or sensitive artifact
  names in PR-06 changes. `gitleaks` is not installed, so this is a documented
  fallback scan rather than a gitleaks attestation.
- The fresh isolated real-stack Chromium suite passed all 11 PR-05 journeys in
  two separate runs. The same fresh 11-journey suite also passed in Firefox and
  WebKit. This includes genuine EventSource offline-to-online recovery.
- A red/green regression test now proves every generated demo password satisfies
  the tenant-bootstrap uppercase, lowercase, digit, and length requirements.
  This repaired a real-stack provisioning failure that previously surfaced as
  HTTP 422 on the second synthetic tenant.
- PD-025 diagnosis captured the real guest HTTP problem
  `409 invalid_state_transition` ("The branch is not accepting new orders")
  with a correlation ID recorded only in the ignored debug journal. Its
  authoritative guard is `canBranchAcceptOrders`: the isolated fixture branch
  was active with configured hours but had `serviceStatus: closed`. Opening it
  through the normal authenticated, CSRF-protected staff command made the same
  QR guest submission return HTTP 201. This is one diagnostic recovery sample,
  not performance evidence; no p50/p95/p99 result is claimed.
- The retained private `@rms/test-support` readiness inspector is read-only,
  tenant-and-branch scoped, and redacts all credentials and browser secrets.
  It is excluded from API and worker composition, and the production build now
  verifies that it is absent from both outputs. The real-stack tenant fixture
  now opens its branch only through the ordinary authenticated,
  origin-checked, CSRF-protected staff `PATCH` command after bootstrap. The
  guard remains unchanged: a closed branch still returns
  `invalid_state_transition`; the opened fixture completed the real guest QR
  order journey in the isolated 11-journey suite.

## Current evidence — 2026-08-25

Production Lighthouse mobile/desktop medians (former blocker 3, resolved):

Repeated Lighthouse runs previously crashed the whole Node process rather
than failing one run, so no three-run median could ever be claimed. Three
distinct, real root causes were found and fixed in
`scripts/lighthouse-median.ts`, none of them a Lighthouse or chrome-launcher
bug we could patch, all avoidable from the caller side:

1. chrome-launcher's own bundled `getRandomPort()` helper (used only when no
   `port` option is passed to `chromeLauncher.launch()`) calls
   `server.listen(0)` before it attaches its `error` listener. A transient
   `ENOBUFS` there throws uncaught and crashes the process instead of
   rejecting a promise. Fixed by always pre-allocating the debugging port
   ourselves (our own `findFreeLoopbackPort`, which attaches its error
   listener first) and passing it explicitly.
2. `startManagedDemoProcess` (this repo's shared child-process helper, used
   throughout `scripts/`) spawns without a shell, matching the established
   convention of invoking `process.execPath` against a resolved `.js` entry
   point rather than a `.cmd` wrapper. Invoking `corepack.cmd` through it
   directly fails with `spawn EINVAL` on Windows. Fixed by resolving vite's
   real entry point and invoking it via `process.execPath`, the same pattern
   `scripts/load-profile.ts` already uses for the API and worker.
3. vite's `package.json` `exports` map does not expose `./bin/vite.js` as an
   importable subpath, so `require.resolve("vite/bin/vite.js")` fails with
   `ERR_PACKAGE_PATH_NOT_EXPORTED` even though the file exists on disk. Fixed
   by resolving `vite/package.json` (which is exported) and reading the real
   entry point from its `bin` field, exactly as pnpm's own `.bin/vite` shim
   does.

Chrome's own profile-directory cleanup — the originally reported EPERM — is
avoided by construction: chrome-launcher's `destroyTmp()` only ever deletes a
profile directory it created itself; passing our own run-scoped
`userDataDir` means it never touches that path. Deletion of the run's
profile directories happens once, at the end of a full run, with a
tolerant retry, well after every Chrome process has already exited.

An intervening ENOBUFS crash (same underlying OS-resource-exhaustion class
as root cause 1, but from a fully separate socket) was also observed on the
first two clean-code attempts; it disappeared once a concurrent, unrelated
16-minute sustained load-profile run on the same machine (see below)
finished, confirming it was resource contention between two heavy local
processes rather than a defect in this script.

18/18 runs succeeded (3 apps × mobile/desktop × 3 runs each) against
production preview builds' root route:

| App | Form factor | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| customer | mobile | 97 | 100 | 96 | 91 |
| customer | desktop | 100 | 100 | 96 | 91 |
| staff | mobile | 85 | 100 | 96 | 91 |
| staff | desktop | 100 | 100 | 96 | 91 |
| admin | mobile | 87 | 100 | 96 | 82 |
| admin | desktop | 100 | 100 | 96 | 82 |

These runs served static preview builds without a live API backend
(`ECONNREFUSED` noise from each app's dev-time API proxy is expected and
harmless), so the numbers should be read as front-end-asset scores, not
full-stack scores. Staff mobile performance (85) and admin SEO (82, both
form factors) are the standout gaps and are candidate inputs for the
visual/UX quality pass.

## Current evidence — 2026-08-26

Visual/UX quality pass across customer, staff, and administration, run
against the live `corepack pnpm dev:demo` environment (dev diagnostics
disabled via `VITE_DISABLE_REACT_DIAGNOSTICS=true`) at mobile, tablet, and
desktop widths, compared against `DESIGN.md` and this document's baseline.
The Lighthouse gaps above were confirmed to be partial signals only: the
real, highest-impact gaps were in administration (not reflected by its SEO
score) and in two customer flows every guest hits, not staff. Weighting was
proportional to findings, not equal across surfaces. Two open design
questions were presented to and resolved by the user before implementation:
unify the customer pre-menu screens with the saffron-frame shell (approved),
and keep Kitchen's high-contrast black action button as a documented
intentional exception rather than aligning it to saffron (approved).

Fixes applied:

- **Administration — heaviest pass.** The Menu page's 13 "common category
  name" suggestion chips rendered as solid-saffron buttons, indistinguishable
  from the real "Add category" call to action, because `.compact-form button`
  (specificity `0,0,1,1`) silently overrode the intended muted `.suggestion-
  pill` style (`0,0,1,0`) — confirmed via computed styles, not just visual
  inspection. Fixed by scoping the pill selector to `.category-suggestions
  .suggestion-pill` (`0,0,2,0`). Native checkboxes rendered browser-default
  blue when checked (no `accent-color` set for admin or staff); fixed by
  hoisting `accent-color: var(--brand-fill)` for `input[type="checkbox"],
  input[type="radio"]` into the shared `apps/web/design-system.css`, removing
  the now-redundant local declaration in customer's stylesheet. The Context
  and Employees pages read as bare label/value lists with large dead white
  space, the weakest screens in the product; Context now uses a stat-card
  grid (`.context-summary-grid`/`.context-stat`) matching the Setup page's
  existing card language, and Employees rows now carry an avatar-initial tile
  reusing the header's own `.account-context__avatar` pattern. The header's
  branch-selector/account-chip stack left an awkward empty gap below 760px
  CSS pixels; fixed by left-aligning the account chip instead of pushing it
  right with `margin-left: auto` into empty space.
- **Customer — two gaps that hit every guest.** The cart review dialog
  forced `height: 100svh` with a `1fr` grid row for the item list, so a
  1–2 item cart (the common case) left roughly half the screen empty between
  the last item and the total — looking broken rather than intentional.
  Fixed by sizing the dialog to its content (`max-height: 100svh` instead of
  a forced height) in a flex column, so it reads as a compact confirmation
  card for a small order and still scrolls correctly for a long one. The
  "Notes are requests only…" disclaimer repeated once per dish plus once
  more in the footer; consolidated to one mention near the category tabs
  (shown once per menu visit) plus the existing footer mention, dropping the
  per-dish repetition. The pre-menu confirm/loading/error screens used a
  plain, frame-less layout with no saffron frame — the very first thing a
  guest sees when scanning a QR code skipped the product's signature visual
  identity — and centered content unpredictably, leaving a large asymmetric
  gap on mobile. Fixed by wrapping them in the same `mise-stage`/`mise-shell`
  saffron-frame treatment the menu itself uses, and switching the internal
  layout from a CSS Grid/implicit-stretch combination to an explicit flex
  column with `justify-content: center`, which centers reliably regardless
  of content height. The quantity `<input type="number">` was the one
  bare native control on an otherwise fully custom-styled screen; native
  spinner arrows are now hidden for a flat, consistent look.
- **Staff — lightest pass, already the strongest surface.** Covered by the
  same `accent-color` hoist above. Kitchen's black "Start preparation"
  action is a deliberate, scoped high-contrast exception for one-metre
  service-line legibility, not an inconsistency; it is now documented in
  `DESIGN.md` under "Kitchen high-contrast action" rather than left as an
  undocumented outlier.

Verification: `format`, `lint`, `typecheck`, and `build` (all three apps plus
the PD-025 production-boundary check) pass. The mocked Chromium/Firefox/
WebKit Playwright suite passed `99/99` on a clean re-run; one Firefox
failure on the first run (an unrelated Features-page assertion in
`admin-setup.spec.ts`, not touched by this pass) was confirmed as a
resource-contention flake by re-running that single test in isolation,
where it passed — consistent with this machine's already-documented
socket/resource constraints under parallel load (see PD-025 evidence below),
not a regression from these changes.

PD-025 sustained-load evidence (blocker 2, still open — see below):

The original blocker was that a loopback-only harness could not create the
distinct real client IPs the public order rate limiter requires (60
submissions/15 min per IP) to prove the full 20-orders/minute profile at 200
guest sessions. That specific problem is fixed: `apps/api/src/config.ts` now
accepts `TRUST_PROXY` as `"false"` or a positive trusted-hop count (never a
blanket `true`, which `express-rate-limit` rightly refuses as
`ERR_ERL_PERMISSIVE_TRUST_PROXY`), and `scripts/load-profile.ts` runs with
`TRUST_PROXY=1` plus a distinct synthetic `X-Forwarded-For` value per guest —
exactly how a real load balancer presents distinct real devices — so each
guest gets its own rate-limit bucket. All 200/200 guest sessions and 5/5
staff sessions authenticate correctly under this profile every time.

What surfaced instead, only at the full 200-guest/16-minute sustained scale
(a 50-guest/90-second run is consistently clean), is a reproducible
`ENOBUFS` (socket resource exhaustion) that collapses request throughput by
roughly half to five-sixths partway through the run and never recovers.
Three distinct, targeted fixes were tried, each addressing a different layer,
and each is a real improvement kept regardless of outcome:

1. `apps/api/src/server.ts`: `server.keepAliveTimeout` raised from Node's 5s
   default to 30s, comfortably longer than any client's idle think-time
   gap, so the server stops closing connections clients still intend to
   reuse. Reduced the failure rate from ~83% to ~47% on its own.
2. `packages/service-workflow/src/postgres-service-workflow.ts`: the
   transaction wrapper's rollback-on-error path is now wrapped in its own
   try/catch. When the original failure is a dead connection, the rollback
   attempt fails too; unhandled, that masked the real error. This is correct
   node-postgres practice independent of this investigation, but made no
   measurable difference to the failure rate here.
3. `scripts/load-profile.ts`: the harness now installs its own `undici`
   `Agent` (`keepAliveTimeout: 60_000`, `connections: 300`) as the global
   fetch dispatcher, replacing Node's default (~4s keep-alive, far fewer
   pooled connections than this harness's ~250 concurrent workers need).
   Verified this actually redirects Node's built-in `fetch()`. Made no
   measurable difference either — the collapse still occurred, slightly
   faster than before.

Direct pool telemetry (temporarily logging `readPoolSaturation` from both the
API and worker processes, since removed) is what ruled out an application bug:
the API's pool is healthy (`total: 10, idle: 9, waiting: 0`) for the first
1–5 minutes, then collapses to `total: 2` (later observed as low as `total: 1`)
and stays there. Critically, `waiting` stays at `0` throughout the collapse —
the pool isn't queuing under pressure, demand reaching the database layer has
simply dried up, meaning requests are failing before ever reaching a route
handler. The worker's own, entirely separate connection to Postgres
independently hit the same `ENOBUFS` in an earlier run. Combined with three
targeted fixes at three different layers all failing to change the outcome,
and the identical failure class independently affecting an unrelated tool
(Lighthouse's chrome-launcher, see above) on this same machine, this is a
genuine local Windows loopback socket-resource ceiling under sustained,
high-churn connection traffic (250 concurrent workers reconnecting every 1–5s
for minutes on end) — not a defect in this application or harness.

The correct environment to gather this specific evidence is the Phase 1
cloud environment from ADR-0007 (Fly.io compute, Neon Postgres), built
exactly to validate the system at this scale. That environment is currently
only an accepted decision, not yet provisioned — there is no `fly.toml`, no
Fly CLI, no Neon connection string anywhere in this repository — and stands
up only with real account/billing access this session does not have.

## Release blockers

1. The mandatory five-person observed usability study has not occurred. No
   participant has been recorded, and no human result may be substituted with
   agent review.
2. PD-025 p50/p95/p99 evidence at the full 200-guest sustained scale is still
   unavailable. The per-IP rate-limit obstacle is resolved (see above:
   `TRUST_PROXY` plus distinct synthetic client IPs). What blocks it now is a
   reproducible local-machine `ENOBUFS` socket-exhaustion collapse under
   sustained high connection churn, confirmed environmental rather than an
   application defect (see evidence above). Closing this requires either the
   Phase 1 cloud environment from ADR-0007 (not yet provisioned) or another
   machine without this constraint. No rate-limit weakening, reset, or
   synthetic success evidence has been introduced.

No staging, commit, push, publication, or PR-07 work is permitted while any
blocker remains.

## Five-person observed usability study packet

Use five distinct restaurant participants. Record only the anonymous code and
role below; do not record names, contact details, credentials, recovery links,
or raw screen/video artifacts. A facilitator observes without rescuing a task
unless a safety, privacy, or irreversible-action boundary requires intervention.

| Code | Participant role | Role journey | Success condition |
| --- | --- | --- | --- |
| P01 | Owner/manager | Configure service readiness and recover a blocked state | Reaches a correct, explained operational state unaided. |
| P02 | General staff | Find and progress an active order | Selects the intended task and completes the allowed handoff. |
| P03 | Kitchen staff | Prioritize and complete kitchen work at one-metre viewing distance | Identifies the next item and changes it to the correct state. |
| P04 | Cashier | Locate a bill and record/correct a payment as permitted | Completes the ledger task without harming historical records. |
| P05 | Customer/host | Open a table menu and submit/review an order | Understands table context, menu choices, and order feedback. |

### Facilitator procedure

1. Use a fresh, isolated demo account and synthetic data. State that the
   participant may stop at any time and that the product—not the participant—is
   being evaluated.
2. Give the role-appropriate task verbatim from the table. Do not teach the
   interface or suggest controls before the participant acts.
3. Record elapsed time, completion, interventions, barriers, and severity in
   the log. Categorize barriers as comprehension, navigation, feedback,
   accessibility, performance, or error recovery.
4. Classify a finding as Critical when it prevents safe task completion or
   causes an irreversible harmful action; Major when it blocks the task or
   requires facilitator rescue; Minor when a workaround exists without
   significant risk.
5. Repair and reverify every Critical or Major finding with the affected task
   and relevant automated coverage. Obtain explicit user approval before
   deferring any Minor finding. Keep only anonymized aggregate evidence.

### Observation log

| Code | Task | Time | Completed | Intervention | Barrier | Severity | Repair and re-verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| P02 | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| P03 | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| P04 | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| P05 | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Completion rule

This record may change from `blocked` only after all technical release gates
and all five observed sessions pass, every Critical/Major finding is repaired
and reverified, and the user explicitly approves any deferred Minor debt.
