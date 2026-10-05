# Vendored PostgreSQL binaries

This folder is gitignored except for this file. Fill it once on the machine
that builds the installer.

1. Download the EDB Windows x86-64 binaries zip for PostgreSQL `18.1` from
   https://www.enterprisedb.com/download-postgresql-binaries.
2. Extract the `bin`, `lib`, and `share` folders here, so that
   `vendor/postgresql/bin/pg_ctl.exe` exists. Keep `share` complete:
   `initdb` needs `share/timezone`, `share/timezonesets`, and
   `share/extension`.

`scripts/build-runtime.mjs` checks for those files and fails the build if any
is missing, then copies the folders into `build/runtime/postgresql`, leaving
out pgAdmin, StackBuilder, documentation, and translations. The copy happens
once; delete `build/runtime/postgresql` to refresh it after changing versions.

Keep the version in step with the repository's pinned PostgreSQL version.
