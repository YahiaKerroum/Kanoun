---
id: HANDOFF-2026-08-29-MISE-DESKTOP
status: final-fix-wave-in-flight
owner: engineering
last_reviewed: 2026-08-29
---

# MISE Desktop Context-Compaction Handoff

> [!IMPORTANT]
> Superseded on 2026-10-06. The Electron app described here was replaced by the Tauri desktop app in `apps/desktop` (ADR-0008); the packaging gaps listed below no longer apply.

## Current state

Working in the git worktree at `C:\Users\HP\Desktop\mvp-desktop-app`, branch
`feature-mise-desktop-app`. This branch already carried 23 unrelated,
pre-existing commits before this work began — its actual starting point for
this plan is commit `cb490d1` ("docs(spec): add MISE Desktop app design"),
**not** `git merge-base main HEAD` (which resolves to `d29cd8c`, `main`'s own
tip, and would incorrectly pull in that unrelated prior history). Always use
`cb490d1..HEAD` when reviewing or diffing this plan's work.

Implemented the full plan at
`docs/superpowers/plans/2026-08-28-mise-desktop-app.md` (15 tasks, argued from
the spec at `docs/superpowers/specs/2026-08-28-mise-desktop-app-design.md`)
using `superpowers:subagent-driven-development`. All 15 tasks are done and
individually reviewed clean. Two follow-up bugfix rounds after that (one for a
plan defect found mid-execution, one for two real bugs found during final
end-to-end verification) are also done and reviewed clean. **A third, larger
fix wave — addressing the findings from the final whole-branch review — was
dispatched to a background subagent and its outcome is unknown as of this
handoff.** See "Exact next steps" below; this is the actual next action.

The full execution ledger — every task, every ruling made, every deferred
finding, in order — is at
`.superpowers/sdd/2026-08-28-mise-desktop-app/progress.md`. That file is the
authoritative record; this handoff summarizes it but does not replace it.

## What MISE Desktop is

A packaged Windows Electron app that runs the real MISE restaurant-management
product (this monorepo's existing `apps/api`, `apps/worker`, three
`apps/web/*` apps) against a bundled, persistent, isolated PostgreSQL cluster,
for non-technical testers with zero prerequisites. A "Home" window lists 4
staff role credentials (Owner/administrator, General staff, Kitchen, Cashier)
plus a guest table-ordering link; each role opens in its own native window
using the product's real sign-in screen (no auto-login shortcut). Data
persists across restarts; a "Reset demo data" action re-seeds on demand. This
is a packaging exercise — **no product/application source code was changed**,
only new Electron/orchestration code (`apps/desktop/`) plus small, deliberate
adaptations to existing dev-tooling scripts (`scripts/demo-postgres.ts`,
`scripts/demo-launcher.ts`).

## What's delivered (Tasks 1-15, commits `997b2a6`..`ef6dbe0`)

- `apps/desktop/` — a new pnpm workspace package: the Electron main process
  (`src/main.ts`), pure/tested support modules (`src/shared/*.ts`,
  `src/window-registry.ts`, `src/tray-menu.ts`, `src/reset-demo-data.ts`),
  and packaging config (`electron-builder.config.cjs`).
- `scripts/desktop-orchestrator.ts` — new, runs via `tsx` (same execution
  model as the existing `scripts/dev-demo.ts`), wires together a persistent
  Postgres cluster, the built api/worker, three `vite preview` servers, and
  an adapted demo launcher.
- `scripts/demo-postgres.ts` — adapted: bundled-binary discovery
  (`bundledBinaryCandidate`) and a persistent (not throwaway) cluster mode
  (`startPersistentDemoPostgres`), both additive and backward-compatible
  with `dev-demo.ts`/`real-e2e-harness.ts`.
- `scripts/demo-launcher.ts` — adapted: an optional `roleLinkMode:
  "direct-sign-in"` that links to each role's real `/auth/sign-in` screen
  instead of the `dev:demo` auto-login shortcut; defaults preserve today's
  `dev:demo` behavior exactly.
- 46 passing unit tests across 11 files for every pure module. `main.ts` and
  `desktop-orchestrator.ts` have no dedicated unit tests by design — matches
  this repo's own precedent (`scripts/dev-demo.ts`,
  `scripts/real-e2e-harness.ts` have none either) — verified instead by
  actually running the app.

**Real, independently-verified end-to-end proof it works** (Task 15, using a
Playwright `_electron` launcher — this exact launch pattern
`{ executablePath: "apps/desktop/node_modules/electron/dist/electron.exe",
args: ["."], cwd: "apps/desktop" }`, stripping `ELECTRON_RUN_AS_NODE` from the
launching shell first, is proven and reused across Tasks 13, 15, and the two
fix rounds): Home window loads real content; all 4 roles signed in via the
real sign-in form in genuinely separate windows; the full golden order
journey (guest order → kitchen prep → serve → cashier payment → owner sees it
in Insights) walked end-to-end with screenshot evidence; Reset demo data
verified (closes windows, re-seeds, old data gone); persistence across a full
app restart verified via the log file (zero reseed lines after relaunch).

## Two real bugs found and fixed during Task 15 (already committed, `ef6dbe0`)

1. **Session isolation** — `openRoleWindow()` gave every role window no
   `webPreferences.partition`, so all staff-target windows shared one
   session; signing into a 2nd/3rd staff role silently logged out earlier
   windows. Fixed with a per-window-open in-memory partition.
2. **Orphaned Postgres on quit** — `ChildProcess.kill()` on Windows
   force-terminates rather than signaling, so the orchestrator's graceful
   shutdown never ran; the Postgres cluster was left running after every real
   app quit. Fixed with a new authenticated `/shutdown` control-server route
   that `before-quit` calls and awaits (bounded timeout, force-kill fallback).

Both re-verified by reproducing the exact original failure scenarios and
confirming they no longer occur, independently corroborated by the controller
viewing the evidence screenshots directly.

## Final whole-branch review (opus, range `cb490d1..ef6dbe0`) — NOT yet resolved

Verdict: **Ready to merge? No.** Two Critical, six Important findings. Full
detail and this session's triage of each is in the ledger's "Final
whole-branch review" section. Summary:

**Critical:**
- **C1 — `corepack pnpm check` (the actual CI gate) fails.** 9 prettier
  violations + 21 eslint errors, all in branch-authored files. Root cause:
  every task review ran targeted `vitest`/`tsc`, never the full gate.
- **C2 — the packaged installer is likely non-functional as configured.**
  `electron-builder.config.cjs`'s `extraResources` omits `drizzle.config.ts`,
  the `migrations/` SQL files, and the building-blocks schema source (so
  migrations can never run in a packaged app), and omits every web app's
  `vite.config.ts` (which carries the `/api` proxy every SPA's `fetch()`
  call depends on — without it, sign-in itself would 404 in a packaged
  build). **Explicitly excluded from the fix wave** — this is a real,
  substantial feature gap (bundling a migration toolchain, and either
  bundling vite's dev-config+plugins or replacing `vite preview` with a
  static-file server + explicit reverse proxy), not a mechanical fix, and
  deserves its own deliberate design pass. Nothing in this plan ever
  actually launched the `electron-builder`-produced `win-unpacked` output —
  Task 15's verification ran the dev-mode unpacked `electron.exe` directly,
  which is a different, always-untouched code path from the packaged one.
  **Flag this to the user directly; do not silently consider the branch
  "done" until it's addressed or the user explicitly accepts the gap.**

**Important (all six ARE in the dispatched fix wave — see "Exact next
steps"):** no user-visible failure path anywhere in the app (contradicts the
spec's own error-handling section); quitting during the ~30s startup window
still orphans everything (the `/shutdown` route starts too late); no
single-instance lock (a second launch's quit can kill the first instance's
backend); reset has no re-entrancy guard and an unrecoverable failure path;
the tray window list shows 3 indistinguishable entries for the 3 staff roles;
`apps/desktop/release/` isn't excluded from the repo's lint/format/typecheck
tooling and already poisoned one prior verification pass.

## Exact next steps

**1. First, check what actually happened to the dispatched fix-wave agent.**
A background subagent (`af207e16f959ac197`, spawned from a now-closed
session) was dispatched with a large, precise fix prompt covering C1 (CI gate)
and all six Important findings (not C2 — deliberately excluded, see above).
As of this handoff it was still "running" (3 minutes in) with no new commit
and no report file yet. **A fresh session cannot message that agent
directly** (subagents are scoped to their spawning session) — check the
filesystem instead:

```powershell
cd C:\Users\HP\Desktop\mvp-desktop-app
git log --oneline -3
git status --short
Test-Path .superpowers\sdd\2026-08-28-mise-desktop-app\task-final-fix-report.md
```

- **If there's a new commit beyond `ef6dbe0` and a report file exists:** the
  agent finished. Read the report, independently spot-check a couple of its
  claims (this session's own practice throughout: view at least one
  screenshot directly, re-run at least one verification command yourself
  rather than trusting the report alone), then generate a scoped re-review
  package (`bash .claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/scripts/review-package docs/superpowers/plans/2026-08-28-mise-desktop-app.md ef6dbe0 HEAD`)
  and dispatch a reviewer against the SAME findings list from the ledger's
  "Final whole-branch review" section (C1 + I1-I6) — this is the SDD
  process's "one scoped re-review of the fix wave," the last review step
  before this branch is done. Adjudicate any residual findings per the SDD
  skill's breaker rules (park with a ruling, or fix directly yourself if truly
  trivial — there is no further fix-wave budget after this).
- **If there's no new commit and no report:** the agent either is still
  genuinely running in the background (unlikely to still be alive once a
  fully new session starts, since the spawning session that hosted it is
  gone) or died/was cut off mid-work. Check for orphaned processes first
  (`Get-CimInstance Win32_Process -Filter "Name='postgres.exe' or
  Name='electron.exe'"`, `Get-NetTCPConnection -State Listen | Where-Object
  LocalPort -in 3000,5173,5174,5175,4170,4171,4172,5433` — kill anything
  found, matching this session's established clean-up pattern), revert any
  partial uncommitted edits (`git status`, `git checkout ef6dbe0 -- <path>`
  for anything dirty), then redispatch the exact same fix prompt fresh. The
  complete, verbatim prompt is saved at
  `.superpowers/sdd/2026-08-28-mise-desktop-app/pending-final-fix-dispatch.md`
  — read and reuse it directly rather than reconstructing it from this
  summary.

**2. Once the fix wave (however it lands) passes its scoped re-review**, do
the SDD skill's actual final step: present C2 (the packaging gap) to the user
explicitly and ask how they want to handle it — options include (a) scope a
follow-up plan to actually make the packaged installer functional, (b)
explicitly accept dev-mode-only as sufficient for now and document that
limitation prominently in `apps/desktop/README.md` (it currently overclaims —
says the packaging config is "proven... functionally," which the final review
showed is not true), or (c) something else the user decides. Do not present
the branch as fully "done" without this conversation happening.

**3. Then use `superpowers:finishing-a-development-branch`** (per the SDD
skill's own closing instruction) to decide how this branch gets integrated —
this has not happened yet. Collect every `Ruling:` line from the ledger into
a "Rulings I made" summary for the user first (the SDD skill requires this
before deleting the workspace) — there are several real ones, including the
`rootDir` plan-defect fix, the Task 8 test-code correction, the C2
exclusion-from-fix-wave decision, and the two Task-15 bug rulings.

**Do not delete `.superpowers/sdd/2026-08-28-mise-desktop-app/`** until the
final review is clean and the branch is actually finished — it's the
ledger, the plan, and all the evidence.

## Continuation prompt

```text
Resume the MISE Desktop plan in C:\Users\HP\Desktop\mvp-desktop-app,
branch feature-mise-desktop-app.

Read this handoff in full:
docs/delivery/handoff-2026-08-29-mise-desktop.md

Then read the execution ledger in full:
.superpowers/sdd/2026-08-28-mise-desktop-app/progress.md

All 15 plan tasks (docs/superpowers/plans/2026-08-28-mise-desktop-app.md) are
done and reviewed clean, commits 997b2a6..ef6dbe0. Two bugfix rounds after
that are also done and committed. The final whole-branch review found 2
Critical + 6 Important findings; a fix wave for the CI-gate failures (C1) and
all 6 Important findings was dispatched to a background agent whose outcome
is unknown — follow this handoff's "Exact next steps" section exactly: check
git log/status first, then either review the completed fix or clean up and
redispatch it from
.superpowers/sdd/2026-08-28-mise-desktop-app/pending-final-fix-dispatch.md.

The packaging-installer gap (C2 in the ledger — migrations and the /api
proxy config aren't bundled, so the electron-builder-produced installer is
likely non-functional even though the dev-mode path is solid and thoroughly
verified) is deliberately NOT part of the fix wave. Surface it to the user
directly once the fix wave's re-review is clean, before treating this branch
as finished.

Use superpowers:subagent-driven-development's own conventions throughout
(task-brief/review-package scripts, the ledger, model selection, no
background-and-wait across turns — three earlier attempts in this plan got
stuck exactly that way and left orphaned PostgreSQL clusters that had to be
manually cleaned up).
```
