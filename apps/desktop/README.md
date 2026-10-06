# Kanoun Desktop

The Windows app that runs Kanoun without any other installs. A Tauri shell
(`src-tauri/`) shows the launcher and the workspace windows; a Node sidecar
runs the runtime host (`runtime/`), which starts PostgreSQL in local mode,
migrates the database, and runs the API, the worker, and the three web apps.
See [ADR-0008](../../docs/architecture/adr/ADR-0008-tauri-desktop-shell.md).

## Layout

| Path                         | What it is                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `index.html`, `src/`         | Launcher UI (TypeScript, no framework), styled by `apps/web/design-system.css` |
| `runtime/host.ts`            | Orchestrates the phases: setup → starting → welcome → ready (or error)         |
| `runtime/protocol.ts`        | The stdio protocol between the shell and the host, validated with Zod          |
| `runtime/local-postgres.ts`  | `initdb` / `pg_ctl` for the cluster in the app data folder                     |
| `runtime/web-server.ts`      | Static server for each web app with the `/api` and `/health` proxy             |
| `runtime/service-process.ts` | Forks the API and worker and stops them over IPC                               |
| `scripts/build-runtime.mjs`  | Bundles the runtime with esbuild and assembles `build/runtime/`                |
| `src-tauri/`                 | Rust shell: sidecar supervision, workspace windows, single instance            |
| `vendor/postgresql/`         | PostgreSQL 18 Windows binaries (not committed, see its README)                 |

## Prerequisites

- The repository toolchain (Node.js 24.18.0 via fnm, pnpm 11.17.0 via
  Corepack). The Node binary that runs the build is copied into the app as
  its sidecar, so build with the pinned version.
- Rust stable (`rustup`) and Visual Studio Build Tools with the C++ workload.
- PostgreSQL 18 binaries in `vendor/postgresql/` for an installer that works
  on machines without PostgreSQL. During development a standard
  PostgreSQL 18 install is used if the vendored copy is missing.

## Commands

From the repository root:

```powershell
corepack pnpm dev:desktop     # build the runtime, then `tauri dev`
corepack pnpm build:desktop   # build the runtime, then the NSIS installer
```

The installer is written to
`src-tauri/target/release/bundle/nsis/Kanoun_<version>_x64-setup.exe`.
It installs per user and needs no administrator rights.

## Where things live on a user's machine

`%APPDATA%\app.mise.desktop\`:

| Entry                    | Contents                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `settings.json`          | Data location (local or server URL) and the fixed ports    |
| `secrets.json`           | Per-install session, bootstrap, and local database secrets |
| `postgres/`              | The local PostgreSQL cluster (local mode only)             |
| `sample-restaurant.json` | Sign-ins for the sample restaurant, if it was loaded       |
| `logs/`                  | `runtime.log`, `postgres.log`, and `host-errors.log`       |
| `webviews/`              | One browser profile per workspace window                   |

`settings.json` and `secrets.json` contain the server connection URL and
local secrets; treat the folder as sensitive.

## Behaviour worth knowing

- **Closing the launcher quits Kanoun.** The shell hides the windows, asks the
  host to stop, and waits; the host stops the API, the worker, and then
  PostgreSQL. If the shell itself dies, the host notices its stdin closing and
  does the same. A cluster left running by a crash is reused on next start.
- **Ports** prefer 47300–47305 and are saved on first configuration, because
  table QR codes contain the guest address.
- **Password resets** are shown in the launcher (no email on a desktop
  install).
- **Workspace windows** are opened from an async command; creating a webview
  from a synchronous Tauri command on Windows deadlocks with a blank window.

## Known limitations

- Workspaces listen on `127.0.0.1` only, so guests cannot yet order from their
  own phones over the restaurant network.
- The installer is not code-signed; SmartScreen shows a warning on first run.
- Switching between local and server storage does not copy data.
