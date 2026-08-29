# MISE Desktop

A packaged Windows desktop build of MISE for non-technical testers: no
Node, no pnpm, no PostgreSQL, no terminal. See
`docs/superpowers/specs/2026-08-28-mise-desktop-app-design.md` for the full
design.

## Building the installer

> **This produces an installer, not a verified-working app.** See "Known
> limitations" below — the packaged build is not currently known to launch
> correctly. Use "Running in development" below for a verified path.

1. One-time: follow `vendor/postgresql/README.md` to place PostgreSQL 18.1
   Windows binaries in `vendor/postgresql/`.
2. From the repository root, with the pinned toolchain active:

   ```powershell
   fnm env --shell powershell | Out-String | Invoke-Expression
   fnm use 24.18.0 | Out-Null
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   corepack pnpm --filter @rms/desktop build
   corepack pnpm --filter @rms/desktop dist:win
   ```

3. The NSIS installer and a portable `.exe` are written to
   `apps/desktop/release/`.

## Running in development

```powershell
corepack pnpm build
corepack pnpm --filter @rms/desktop build
corepack pnpm --filter @rms/desktop start
```

This runs the unpackaged Electron shell directly against your local
PostgreSQL 18 install (via `scripts/demo-postgres.ts`'s existing
system-install fallback) — no vendored binaries needed for this path.

## Manual verification checklist

(Matches the spec's "Testing" section — this repo has no automated coverage
for the packaging layer itself.)

- Install (or run unpackaged) on a machine, launch, confirm the Home window
  and its four role credentials appear.
- Sign into Owner, General staff, Kitchen, and Cashier in separate windows
  using the real sign-in screen (business code + email + revealed
  password) — no auto-login.
- Open a customer table URL and walk the golden journey end to end: guest
  orders, kitchen preps, cashier pays.
- Use the tray's "Reset demo data" action; confirm open role windows close,
  the Home window reopens, and re-seeded data appears correctly afterward.
- Restart the app entirely; confirm previously-entered data (not just the
  seed) is still present — this is the "data persists across restarts"
  requirement.

## Known limitations

- **The packaged installer is not currently known to work.**
  `electron-builder.config.cjs`'s `extraResources` does not bundle
  `drizzle.config.ts`, the `migrations/` SQL files, or the building-blocks
  schema source, so database migrations cannot run in a packaged build; it
  also does not bundle any web app's `vite.config.ts` (which carries the
  `/api` proxy every SPA's `fetch()` call depends on), so `vite preview` in
  a packaged app would 404 every API call, breaking sign-in entirely.
  Nothing in this app's implementation or verification has ever actually
  launched the `electron-builder`-produced `win-unpacked`/installer output —
  all verification to date has run the unpackaged dev-mode Electron shell
  directly (`corepack pnpm --filter @rms/desktop start`), which **is**
  thoroughly and repeatedly verified end to end. Making the installer
  actually functional needs its own deliberate follow-up (bundling a
  migration toolchain, and either bundling Vite's dev config/plugins into
  the packaged resources or replacing `vite preview` with a static-file
  server plus an explicit reverse proxy) — do not treat "the installer
  builds" as evidence the packaged app runs.
- **Quitting during the ~30s startup window can leave a stray `postgres.exe`
  running.** A normal quit (after startup has finished) is clean and
  verified — the orchestrator's `/shutdown` route runs a full graceful
  shutdown, including stopping PostgreSQL, in a few seconds. But if the app
  is quit _during_ startup, the 8-second force-kill fallback in
  `src/main.ts`'s `shutdownOrchestrator()` can fire before that graceful
  path completes, and Windows' `taskkill /T` cannot reach `postgres.exe` at
  that point because `pg_ctl start` has already detached it from the
  orchestrator's own process tree. The data itself is never at risk (the
  Postgres data directory persists correctly either way); the symptom is a
  leftover process holding port 5433 until manually killed. Properly
  closing this needs an abortable startup sequence in
  `scripts/desktop-orchestrator.ts` (racing shutdown against each startup
  stage, not just making `/shutdown` reachable earlier), which is real
  scope beyond a mechanical fix.
- `node_modules` is bundled into the packaged app wholesale rather than
  pruned to production dependencies — functionally correct but larger than
  necessary. A follow-up could use `pnpm deploy` or similar.
- No custom `.ico`; `electron-builder` falls back to its default Electron
  icon. The in-app tray icon is a functional 1x1 placeholder (see
  `src/main.ts`).
- No code signing — Windows SmartScreen will show an "unknown publisher"
  warning on first run (see the spec's "Error handling and known risks").
