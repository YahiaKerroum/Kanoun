---
id: ADR-0008
status: accepted
version: 1.0
owner: architecture
last_reviewed: 2026-10-06
source_of_truth_for:
  - desktop-distribution
---

# ADR-0008 — Tauri desktop shell with local or server PostgreSQL

## Context

MISE needs to run at a restaurant without anyone installing Node, pnpm, or
PostgreSQL, and without a terminal. Two restaurant shapes matter:

1. One counter or till, where the data can live on that computer.
2. Several computers (floor, kitchen, cashier) sharing one restaurant, where
   the data lives on a PostgreSQL server on the local network.

A first attempt packaged the product with Electron (`apps/desktop`, August
2026). Its development path worked, but the installer never ran:
electron-builder copied pnpm's symlinked `node_modules` and rewrote the links
as absolute paths to the build machine, workspace packages could not resolve
their dependencies once relocated, `vite preview` and its proxy config were
needed at runtime, and the vendored PostgreSQL `share/` folder was incomplete.
Graceful shutdown on Windows also relied on signals that Windows does not
deliver, which left PostgreSQL running after quitting.

## Decision

Replace Electron with a Tauri 2 shell and a Node runtime host:

- **Shell (Rust, `apps/desktop/src-tauri`).** Owns windows only: the launcher
  window plus one window per workspace (staff, back office, guest), each with
  its own WebView2 profile so different people stay signed in side by side.
  It supervises a single sidecar process and speaks line-delimited JSON with
  it over stdio. Workspace windows get no Tauri capabilities.
- **Runtime host (TypeScript, `apps/desktop/runtime`).** Runs on a bundled
  Node binary. It starts PostgreSQL in local mode (bundled binaries, cluster
  in the app data folder), applies the versioned migrations with
  `applyDatabaseMigrations`, forks the API and worker as separate processes
  (preserving ADR-0002's process split), and serves the three built web apps
  with an `/api` proxy. All stop requests travel over stdin and IPC.
- **Packaging.** The host, API, worker, and seeder are bundled with esbuild,
  so the install folder is relocatable. Only `argon2` ships as a native module
  next to the bundles.
- **Data location** is chosen in the launcher: *on this computer* or *on a
  PostgreSQL server* given by a connection URL. The server database must
  already exist; MISE creates its own schemas. The sample restaurant can only
  be loaded into an empty database, and only local data can be erased from
  the launcher.

## Consequences

- The API and worker code are unchanged in behaviour; they gained reusable
  start functions (`startApiServer`, `runWorker`) shared by their own
  entrypoints and the desktop host.
- Ports are fixed per install (preferring 47300–47305) because table QR codes
  embed the guest origin. Workspace origins reach the web apps at runtime
  through a `<meta name="mise-origins">` tag instead of build-time variables.
- Without email delivery on a desktop install, password-reset tokens are
  delivered to a loopback inbox and shown in the launcher.
- Workspaces bind to `127.0.0.1`. Guests ordering from their own phones on
  the restaurant network is not yet supported by the desktop install and
  needs its own decision (LAN binding, TLS, and origin handling).
- The installer is unsigned; Windows SmartScreen warns on first run.

This ADR does not supersede ADR-0007. It records one way to run MISE on
premises; the phase-2 hosting decision in ADR-0007 remains open.
