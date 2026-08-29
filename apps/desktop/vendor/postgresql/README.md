# Vendored PostgreSQL binaries

This directory is gitignored (except this file) — it is filled in once by
whoever builds the Windows installer, not committed to the repository.

## One-time setup

1. Download the official EDB Windows x86-64 "binaries" zip for PostgreSQL
   `18.1` (matching this repo's pinned version) from
   https://www.enterprisedb.com/download-postgresql-binaries.
2. Extract it so this directory contains a `bin/` folder directly, i.e.
   `apps/desktop/vendor/postgresql/bin/initdb.exe`,
   `apps/desktop/vendor/postgresql/bin/pg_ctl.exe`, etc.
3. Run `corepack pnpm --filter @rms/desktop dist:win` (or `dist:portable`).
   `electron-builder`'s `extraResources` config copies this `bin/` folder to
   `resources/postgresql/bin` inside the packaged app, where
   `scripts/demo-postgres.ts`'s `bundledBinaryCandidate` looks for it first.

## Keeping this in sync

If the repository's pinned PostgreSQL version changes (see the root
`README.md` "Quick start" prerequisites), re-download matching binaries here
before building a new installer. There is no automated check that these
stay in sync — see the spec's "Postgres binary provenance" risk note.
