# MISE Desktop

A packaged Windows desktop build of MISE for non-technical testers: no
Node, no pnpm, no PostgreSQL, no terminal. See
`docs/superpowers/specs/2026-08-28-mise-desktop-app-design.md` for the full
design.

## Building the installer

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

## Known simplifications (first pass)

- `node_modules` is bundled into the packaged app wholesale rather than
  pruned to production dependencies — functionally correct but larger than
  necessary. A follow-up could use `pnpm deploy` or similar.
- No custom `.ico`; `electron-builder` falls back to its default Electron
  icon. The in-app tray icon is a functional 1x1 placeholder (see
  `src/main.ts`).
- No code signing — Windows SmartScreen will show an "unknown publisher"
  warning on first run (see the spec's "Error handling and known risks").
