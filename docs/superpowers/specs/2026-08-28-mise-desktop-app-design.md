---
id: MISE-DESKTOP-APP
status: draft
version: 0.1
owner: engineering
---

# MISE Desktop — a locally installable build for testing the product

## Purpose

Let someone install and run the real MISE product on a Windows machine
with **zero prerequisites** (no Node, no pnpm, no PostgreSQL, no terminal),
open a small home screen that lists the demo business's roles and
credentials, and launch as many role windows as they want side by side to
walk the product end to end — including the full golden journey (guest
orders while kitchen preps while cashier pays) — using the real sign-in
screens, not a login shortcut.

This is a packaging exercise, not a product-behavior change. No
application code changes; the product runs exactly as it does today.

A second, much smaller deliverable rides along: a `.vscode/tasks.json`
entry that runs `corepack pnpm dev:demo` for development use. That one is
bounded (a config file addition to an existing script) and isn't part of
this spec — it'll be added directly when this work lands.

## Decisions already made (from brainstorming)

- **Two audiences, two artifacts.** A VS Code task for development
  (out of scope here). A packaged Windows desktop app — "MISE Desktop" —
  for non-technical testers. This spec covers only the desktop app.
- **Bundled, portable PostgreSQL.** The installed app carries its own
  PostgreSQL binaries and manages a private, isolated cluster. A tester
  never installs or configures a database.
- **Real sign-in, not a shortcut.** The home screen shows each role's
  credentials (business code, email, a reveal-password control) and a
  button that opens that role's actual sign-in screen. No auto-login.
- **Multiple independent windows.** The home screen can open any number
  of role windows — Guest, Owner, General staff, Kitchen, Cashier — each
  signed in independently, so the golden journey can be walked solo.
- **Windows only**, for now.
- **Data persists** in the app's own folder across restarts. A "Reset
  demo data" menu action re-seeds from scratch on demand.

## Architecture

### Process model

```
Electron main process
 ├─ spawns: desktop-orchestrator (Node child process, adapted from
 │           scripts/dev-demo.ts)
 │            ├─ starts the bundled, isolated PostgreSQL cluster
 │            ├─ runs migrations (first run only: seeds demo data)
 │            ├─ spawns apps/api (dist/server.js) and apps/worker
 │            │  (dist/worker.js) — reusing scripts/demo-process.ts
 │            │  unchanged
 │            ├─ spawns `vite preview` against the pre-built
 │            │  apps/web/{customer,staff,admin}/dist bundles, on the
 │            │  product's existing fixed ports (5174/5173/5175) — the
 │            │  same production-like serving real-e2e-harness.ts
 │            │  already does for CI, just left running instead of torn
 │            │  down
 │            └─ starts an adapted demo-launcher HTTP server (home page)
 │
 ├─ opens the Home window once the orchestrator reports ready, pointed
 │  at the demo-launcher origin
 │
 └─ intercepts link clicks from the Home window (setWindowOpenHandler)
    and opens a new BrowserWindow per role instead of navigating away
```

Almost everything here already exists in `scripts/`, built for
`corepack pnpm dev:demo`. This is deliberate: the desktop app is that
same orchestration, repackaged to run once, persist data, and open native
windows instead of printing a `pnpm dev:demo` URL to a terminal. The
product's actual runtime (API, worker, web apps, database) doesn't change
at all — only how it's launched and how a person gets between roles.

### What's reused unchanged

- `scripts/demo-process.ts` — child-process spawn/monitor/terminate,
  secret-redacting log capture. No changes.
- `scripts/seed-demo.ts`, `scripts/demo-secrets.ts`,
  `scripts/demo-recovery-delivery.ts` — demo data, generated secrets,
  local recovery-link inbox. No changes.
- `apps/api`, `apps/worker`, `apps/web/{customer,staff,admin}` — the
  actual product. Built once at packaging time
  (`corepack pnpm -r build`), then the resulting `dist/` output is what
  ships. No source changes.

### What's adapted

- **`scripts/demo-postgres.ts`'s binary discovery.** Today
  `findPostgresBinary` looks in `C:\Program Files\PostgreSQL\18\bin\` or
  on `PATH` — it assumes PostgreSQL is already installed system-wide.
  The desktop app instead ships real PostgreSQL 18.x Windows binaries as
  a packaged resource (see Packaging below) and points binary discovery
  at `process.resourcesPath` first. The cluster-lifecycle logic
  (`initdb` → `pg_ctl start` → wait → ... → `pg_ctl stop`) is otherwise
  used as-is.
- **`scripts/dev-demo.ts`'s orchestration**, into a new
  `desktop-orchestrator.ts`:
  - Web apps run via `vite preview` against pre-built `dist/`, not the
    dev server dev-demo.ts uses today (avoids shipping the dev
    toolchain, dev-only diagnostics overlays, and HMR websockets inside
    a packaged app).
  - First-run vs. persistent-run branching: seed only if the bundled
    cluster's data directory doesn't exist yet; otherwise start the
    existing one as-is.
  - Emits a single ready line the Electron main process waits for
    (reusing the `waitForText` pattern `demo-process.ts` already has),
    instead of printing a message for a human to read.
- **`scripts/demo-launcher.ts`'s home page**: same credential-display
  layout (business code, per-role email, reveal-password control), but
  role links point at each app's real entry URL (that role's
  `/auth/sign-in`, or the actual customer QR URL for the guest role)
  instead of the `/launch/<role>` auto-login shortcut it uses for
  `dev:demo` today. Opening one is intercepted in the Electron main
  process and turned into a new `BrowserWindow`, not a browser-tab
  navigation.

### What's new

- Electron main-process shell: window lifecycle, orchestrator process
  supervision, the `setWindowOpenHandler` interception, a "Reset demo
  data" menu item, and a system tray / window-list affordance so open
  role windows are easy to find.
- Packaging config (`electron-builder`) and the one-time build step that
  fetches the portable PostgreSQL binaries into the packaged resources.

### Data flow: first run vs. every subsequent run

**First run.** Install → launch → main process starts the orchestrator →
no existing cluster data directory found under
`%APPDATA%\MISE Desktop\postgres-data\` → `initdb` → `pg_ctl start` →
run migrations → seed the Dar Nedjma / Hydra demo dataset → spawn
api/worker → spawn the three `vite preview` servers → start the launcher
→ ready line → Home window opens.

**Every later run.** Same, except the existing cluster data directory is
found, so seeding is skipped — the tester's own data (orders, any
employees or menu edits they made) is exactly as they left it.

**Reset demo data.** A menu action in the Home window: closes all open
role windows (their session cookies are about to reference deleted
records), tells the orchestrator to stop the API and worker, re-run
`resetDemoDatabase` + `seedDemo` against the already-running PostgreSQL
cluster, restart the API and worker against the fresh data, then reopens
the Home window. The database cluster itself stays up throughout; only
the API/worker processes and their in-memory state need a clean restart
so nothing serves stale connections against the recreated schema.

## Packaging

- **Build tool:** `electron-builder`, targeting a Windows NSIS installer
  (Start Menu entry, uninstaller) as the primary artifact. A portable
  `.exe` (no install) is a low-cost second target from the same config
  and worth producing too.
- **Bundled PostgreSQL:** the *developer* building the installer
  downloads the official EDB Windows x86-64 "binaries" zip for
  PostgreSQL 18.x once (matching this repo's pinned `18.1`) into a
  `desktop/vendor/postgresql/` folder (documented, gitignored — not
  committed to the repo); `electron-builder`'s `extraResources` copies
  it into the packaged app. The *end user* downloads and runs one
  installer with everything already inside — nothing to fetch at
  install or run time.
- **Bundled app code:** production builds of `apps/api`, `apps/worker`,
  and the three `apps/web/*` bundles, plus the `desktop-orchestrator`
  and its dependencies, all built ahead of packaging by the existing
  `corepack pnpm -r build` and included as `extraResources` /
  `asar`-packed app code.
- **App data location:** `%APPDATA%\MISE Desktop\` — Postgres cluster,
  generated per-install secrets (session/bootstrap/etc., generated once
  on first run and persisted, not regenerated per launch the way
  `dev-demo.ts` does today since that would invalidate persisted
  sessions), and log files.

## Error handling and known risks (being honest about "starters")

- **Port conflicts.** The app uses fixed loopback ports
  (5432-range for Postgres, 3000, 5173-5175). If something else on the
  tester's machine already holds one, startup fails. For starters: fail
  with a clear message naming the port; a follow-up could probe for a
  free port and rewire the config, but that adds real complexity
  (every hardcoded `WEB_ORIGIN`/`API_PROXY_ORIGIN` assumption would need
  to become dynamic) and is deliberately deferred.
- **Windows SmartScreen / unsigned binary.** Without a code-signing
  certificate (out of scope for starters), Windows will show an "unknown
  publisher" warning on first run. Testers will need to click through
  it. Worth a line in whatever instructions accompany the build.
- **Firewall prompts.** Starting servers bound to loopback shouldn't
  trigger Windows Firewall, but if it does, the prompt is expected and
  safe to allow.
- **Crash recovery.** If the API or worker child process dies mid-session,
  the desktop app doesn't currently auto-restart it (matching
  `dev-demo.ts`'s behavior — it doesn't either). Open role windows would
  show connection errors until the app is restarted. Acceptable for a
  starters build; flagged rather than silently accepted.
- **Postgres binary provenance.** Bundling binaries built by a third
  party (EDB) rather than compiling from source is standard practice for
  this kind of embedding and PostgreSQL's license permits redistribution,
  but it does mean the shipped Postgres version needs to be manually kept
  in sync with this repo's pinned version (`18.1`) when either changes.

## Testing

- **Manual, on a clean Windows VM or a machine without PostgreSQL
  installed** (the realistic "customer" scenario) — this is the test
  that actually matters here, more than automated coverage: install,
  launch, confirm the Home window and credentials appear, sign into each
  of the four roles in separate windows, and walk the golden journey
  across them.
- **Reset demo data** exercised at least once per manual pass, confirming
  open windows close cleanly and re-seeded data appears correctly after.
- No new automated test suite is proposed for the packaging layer itself
  — it's an orchestration/build concern, not product logic, and the
  product logic underneath is already covered by this repo's existing
  suites. If a bug surfaces here later that's worth pinning down with a
  script, that can be added then.

## Explicitly out of scope for this pass

- macOS/Linux builds.
- Code signing / auto-update.
- Dynamic port allocation / conflict resolution.
- Auto-restart of crashed child processes.
- Any change to product source code, contracts, or the pinned toolchain
  version story documented elsewhere in this repo.
- The `.vscode/tasks.json` dev-task addition (bounded, handled
  separately).
