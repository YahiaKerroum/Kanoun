# MISE Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows-installable "MISE Desktop" Electron app that runs the real MISE product (API, worker, three web apps) against a bundled, persistent, isolated PostgreSQL cluster, and lets a non-technical tester open the real sign-in screens for Owner/General staff/Kitchen/Cashier/Guest in separate windows — no terminal, no auto-login.

**Architecture:** An Electron main process (`apps/desktop`) spawns a Node child process, `scripts/desktop-orchestrator.ts` (run via `tsx`, exactly like the existing `scripts/dev-demo.ts`), which starts a persistent bundled PostgreSQL cluster, seeds it on first run only, starts the built `apps/api`/`apps/worker`, serves the three built web apps via `vite preview`, and starts an adapted `scripts/demo-launcher.ts` whose role cards link to each app's real `/auth/sign-in` screen. The orchestrator reports readiness over stdout as a single JSON line; the Electron main process parses it, opens a "Home" window pointed at the launcher, and intercepts clicks on role links (`setWindowOpenHandler`) to open a native `BrowserWindow` per role instead of navigating away. A "Reset demo data" tray/menu action drives a small authenticated HTTP control endpoint the orchestrator also exposes.

**Tech Stack:** TypeScript (strict, `tsconfig.base.json`), Node.js `24.18.0`, pnpm `11.17.0` workspaces, `tsx` for running orchestration scripts unbuilt (matches existing `scripts/` convention), Electron `44.0.0`, `electron-builder` `26.15.3`, Vitest for unit tests, Zod for runtime validation, existing `scripts/demo-*.ts` modules reused per the spec.

**Spec:** `docs/superpowers/specs/2026-08-28-mise-desktop-app-design.md`

## Global Constraints

- Node `24.18.0` / pnpm `11.17.0` pinned toolchain (README "Quick start"). In this non-interactive PowerShell environment, every verification command must first run:
  `fnm env --shell powershell | Out-String | Invoke-Expression; fnm use 24.18.0 | Out-Null`
  (shell state does not persist between tool calls — repeat this line every time).
- `"type": "module"` and strict TypeScript extending `tsconfig.base.json`, exactly like `apps/api`/`apps/worker` (`rootDir: "src"`, `composite: true`, `paths: {}` to clear inherited source aliases, `tsc -p tsconfig.json` as the `build` script).
- No product/application code changes: `apps/api`, `apps/worker`, `apps/web/{customer,staff,admin}` source is untouched. Only `scripts/` (dev tooling, not product code) and the new `apps/desktop` package are touched.
- No secrets or vendored PostgreSQL binaries committed to git. `apps/desktop/vendor/postgresql/` is gitignored except its own README.
- Fixed loopback ports throughout (matches the spec's "Error handling and known risks" section): API `3000`, staff `5173`, customer `5174`, admin `5175`, demo launcher `4170`, recovery-delivery inbox `4171`. New desktop-only ports: PostgreSQL `5433` (avoids colliding with a possible system PostgreSQL on `5432`), reset control server `4172`.
- **Why new shared modules live under `apps/desktop/src/shared/` and not `scripts/`:** `scripts/*.ts` files are never compiled by `tsc` — they run only via `tsx` (confirmed: `dev:demo` is `corepack pnpm build && tsx scripts/dev-demo.ts`). `apps/desktop`'s own source, by contrast, must build with a real `tsc -p tsconfig.json` step (ground rules require this), which sets `rootDir: "src"`. If `apps/desktop/src` imported a `scripts/*.ts` **value** (a function, a class, a runtime constant) by relative path, `tsc` would need to emit that file too, and it lives outside `rootDir`, which fails the build (TypeScript error TS6059, confirmed empirically against this repo). So: new logic that both `apps/desktop/src/main.ts` (compiled) and `scripts/desktop-orchestrator.ts` (run via `tsx`, which does not care about `rootDir` at all) need to share lives in `apps/desktop/src/shared/`, and `scripts/desktop-orchestrator.ts` reaches it via a plain relative import (`tsx` resolves and transpiles it on the fly, exactly like it already does for every other file in `scripts/`). `apps/desktop/src/shared/*.ts` files must therefore never import a **value** from `scripts/*.ts` (a `import type { X } from "../../../../scripts/y.js"` is fine and free — type-only imports are erased and never subject to `rootDir`/emit checks — but never `import { x } from "../../../../scripts/y.js"`). Where a shared module would otherwise need a tiny value from `scripts/demo-secrets.ts` (`randomBytes(...).toString("base64url")`, two lines), it is reimplemented locally rather than imported, to avoid the cross-boundary problem for two trivial lines.
- **Why `scripts/desktop-orchestrator.ts` lives in `scripts/`, not `apps/desktop/src/`:** the spec explicitly frames it as `dev-demo.ts`'s orchestration "adapted... into a new `desktop-orchestrator.ts`" — a sibling of `dev-demo.ts` and `real-e2e-harness.ts`, reusing their exact unmodified import style (`./demo-postgres.js`, `./demo-process.js`, etc.) and their exact execution model (`tsx`, never `tsc`-compiled). Placing it there means zero new cross-package resolution problem for the eight existing `scripts/*.ts` modules it reuses.
- **Electron spawns Node child processes via its own binary.** `process.execPath` inside Electron's main process is the Electron binary, not a plain Node binary. Spawning it to run `scripts/desktop-orchestrator.ts` via `tsx` requires `ELECTRON_RUN_AS_NODE: "1"` in that child's environment, or Electron launches another GUI process instead of running the script. This is set once in `apps/desktop/src/main.ts` and inherited by every further descendant process (api/worker/vite preview) because `scripts/desktop-orchestrator.ts`'s own `runtimeEnvironment()` spreads `...process.env` into their env.
- Verified locally in this worktree before writing this plan: `corepack pnpm install --frozen-lockfile` and `corepack pnpm build` both succeed with the pinned toolchain; `apps/api/dist/server.js`, `apps/worker/dist/worker.js`, and each `apps/web/*/dist` exist afterward; `tsx` resolves `@rms/building-blocks` etc. only **after** that build (not before — confirmed by direct experiment); PostgreSQL `18` is installed locally at `C:\Program Files\PostgreSQL\18`, so `findPostgresBinary`'s existing fallback path lets every task below be verified in dev mode without needing vendored binaries.

---

## Task 1: Scaffold the `apps/desktop` workspace package

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts` (placeholder entry so the build has something to compile — replaced with real content in Task 13)
- Modify: `pnpm-workspace.yaml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a workspace member `@rms/desktop` other tasks add files to; a `dist/main.js` build output later tasks assume exists.

- [ ] **Step 1: Register the workspace package**

Edit `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/api
  - apps/worker
  - apps/web/*
  - apps/desktop
  - packages/*

allowBuilds:
  argon2: true
  esbuild: true

minimumReleaseAgeExclude:
  - "@redocly/cli@2.41.0"
  - express-rate-limit@8.6.1
  - globals@17.8.0
```

- [ ] **Step 2: Create the package manifest**

Create `apps/desktop/package.json`:

```json
{
  "name": "@rms/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "electron .",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "dist:win": "electron-builder --win nsis --config electron-builder.config.cjs",
    "dist:portable": "electron-builder --win portable --config electron-builder.config.cjs"
  },
  "dependencies": {
    "tsx": "4.23.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "electron": "44.0.0",
    "electron-builder": "26.15.3"
  }
}
```

- [ ] **Step 3: Create the package tsconfig**

Create `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "types": ["node"],
    "paths": {}
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: Create a placeholder entry point**

Create `apps/desktop/src/main.ts`:

```ts
export {};
```

(This is replaced with the real Electron main process in Task 13. Its only purpose here is to give `tsc -p tsconfig.json` something valid to compile so this task is independently verifiable.)

- [ ] **Step 5: Ignore build/packaging output and the vendored PostgreSQL binaries**

Edit `.gitignore`, adding these lines under "Local tooling" (or any sensible existing section):

```gitignore
# MISE Desktop packaging
apps/desktop/release/
apps/desktop/vendor/postgresql/*
!apps/desktop/vendor/postgresql/README.md
```

- [ ] **Step 6: Install and verify the package builds**

Run (PowerShell, pinned toolchain):

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @rms/desktop build
```

Expected: install succeeds, `@rms/desktop` appears in the workspace list, and `apps/desktop/dist/main.js` is created containing only `export {};`-equivalent output.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml .gitignore apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/src/main.ts apps/desktop/dist -n
git add pnpm-workspace.yaml .gitignore apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/src/main.ts
git commit -m "feat(desktop): scaffold the apps/desktop workspace package"
```

(The `-n` dry-run line is just to confirm `dist/` isn't accidentally staged — it's git-ignored already by the root `dist/` pattern, so the second `git add` should not pick it up.)

---

## Task 2: `desktop-paths.ts` — resolve the app data directory layout

**Files:**
- Create: `apps/desktop/src/shared/desktop-paths.ts`
- Create: `apps/desktop/src/shared/desktop-paths.test.ts`

**Interfaces:**
- Produces: `DesktopPaths` interface and `resolveDesktopPaths(appDataDirectory: string): DesktopPaths`, `ensureDesktopDirectories(paths: DesktopPaths): Promise<void>`, consumed by Tasks 3, 4, 6, 12, 13.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/desktop-paths.test.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDesktopDirectories, resolveDesktopPaths } from "./desktop-paths.js";

describe("resolveDesktopPaths", () => {
  it("nests every path under a 'MISE Desktop' folder inside the given app data directory", () => {
    const paths = resolveDesktopPaths("C:\\Users\\Test\\AppData\\Roaming");

    expect(paths.root).toBe("C:\\Users\\Test\\AppData\\Roaming\\MISE Desktop");
    expect(paths.postgresDataDirectory).toBe(
      "C:\\Users\\Test\\AppData\\Roaming\\MISE Desktop\\postgres-data",
    );
    expect(paths.secretsFile).toBe(
      "C:\\Users\\Test\\AppData\\Roaming\\MISE Desktop\\secrets.json",
    );
    expect(paths.seedResultFile).toBe(
      "C:\\Users\\Test\\AppData\\Roaming\\MISE Desktop\\seed-result.json",
    );
    expect(paths.logFile).toBe(
      "C:\\Users\\Test\\AppData\\Roaming\\MISE Desktop\\logs\\desktop.log",
    );
  });
});

describe("ensureDesktopDirectories", () => {
  let appDataDirectory = "";

  beforeEach(async () => {
    appDataDirectory = await mkdtemp(join(tmpdir(), "mise-desktop-paths-"));
  });

  afterEach(async () => {
    await rm(appDataDirectory, { recursive: true, force: true });
  });

  it("creates the root and logs directories", async () => {
    const paths = resolveDesktopPaths(appDataDirectory);

    await ensureDesktopDirectories(paths);

    expect(existsSync(paths.root)).toBe(true);
    expect(existsSync(paths.logsDirectory)).toBe(true);
  });

  it("does not fail when called a second time", async () => {
    const paths = resolveDesktopPaths(appDataDirectory);

    await ensureDesktopDirectories(paths);
    await expect(ensureDesktopDirectories(paths)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-paths.test.ts
```

Expected: FAIL — `./desktop-paths.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/shared/desktop-paths.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface DesktopPaths {
  readonly root: string;
  readonly postgresDataDirectory: string;
  readonly secretsFile: string;
  readonly seedResultFile: string;
  readonly logsDirectory: string;
  readonly logFile: string;
}

export function resolveDesktopPaths(appDataDirectory: string): DesktopPaths {
  const root = join(appDataDirectory, "MISE Desktop");
  return {
    root,
    postgresDataDirectory: join(root, "postgres-data"),
    secretsFile: join(root, "secrets.json"),
    seedResultFile: join(root, "seed-result.json"),
    logsDirectory: join(root, "logs"),
    logFile: join(root, "logs", "desktop.log"),
  };
}

export async function ensureDesktopDirectories(
  paths: DesktopPaths,
): Promise<void> {
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.logsDirectory, { recursive: true });
}
```

Note: `postgresDataDirectory` is deliberately **not** created here — `initdb` (Task 7) requires its target directory to either not exist or be empty, and leaving its creation to `initdb` avoids any ambiguity about that precondition.

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-paths.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/desktop-paths.ts apps/desktop/src/shared/desktop-paths.test.ts
git commit -m "feat(desktop): add desktop-paths for the app data directory layout"
```

---

## Task 3: `desktop-secrets.ts` — persisted per-install secrets

**Files:**
- Create: `apps/desktop/src/shared/desktop-secrets.ts`
- Create: `apps/desktop/src/shared/desktop-secrets.test.ts`
- Modify: `apps/desktop/package.json` (already has `zod`; no change needed — confirms the dependency added in Task 1 is used)

**Interfaces:**
- Consumes: none (self-contained; deliberately reimplements `scripts/demo-secrets.ts`'s two one-line generator functions locally rather than importing them — see Global Constraints).
- Produces: `DesktopSecrets` interface and `loadOrCreateDesktopSecrets(secretsFilePath: string): Promise<DesktopSecrets>`, consumed by Tasks 12 and 13.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/desktop-secrets.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateDesktopSecrets } from "./desktop-secrets.js";

describe("loadOrCreateDesktopSecrets", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mise-desktop-secrets-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("creates and persists secrets on first run", async () => {
    const secretsFile = join(directory, "secrets.json");

    const secrets = await loadOrCreateDesktopSecrets(secretsFile);

    expect(secrets.sessionSecret.length).toBeGreaterThan(20);
    expect(secrets.bootstrapSecret.length).toBeGreaterThan(20);
    expect(secrets.supportAccessSecret.length).toBeGreaterThan(20);
    expect(secrets.guestAccessSecret.length).toBeGreaterThan(20);
    expect(secrets.recoveryDeliverySecret.length).toBeGreaterThan(20);
    expect(secrets.controlSecret.length).toBeGreaterThan(20);
    expect(secrets.databasePassword.length).toBeGreaterThan(20);
    expect(secrets.seedPassword.length).toBeGreaterThanOrEqual(12);
  });

  it("returns the same secrets on a later call instead of regenerating them", async () => {
    const secretsFile = join(directory, "secrets.json");
    const first = await loadOrCreateDesktopSecrets(secretsFile);

    const second = await loadOrCreateDesktopSecrets(secretsFile);

    expect(second).toEqual(first);
  });

  it("generates different secrets across two independent files", async () => {
    const first = await loadOrCreateDesktopSecrets(join(directory, "a.json"));
    const second = await loadOrCreateDesktopSecrets(join(directory, "b.json"));

    expect(first.sessionSecret).not.toBe(second.sessionSecret);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-secrets.test.ts
```

Expected: FAIL — `./desktop-secrets.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/shared/desktop-secrets.ts`:

```ts
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

export interface DesktopSecrets {
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly recoveryDeliverySecret: string;
  readonly controlSecret: string;
  readonly databasePassword: string;
  readonly seedPassword: string;
}

const desktopSecretsSchema = z.object({
  sessionSecret: z.string().min(1),
  bootstrapSecret: z.string().min(1),
  supportAccessSecret: z.string().min(1),
  guestAccessSecret: z.string().min(1),
  recoveryDeliverySecret: z.string().min(1),
  controlSecret: z.string().min(1),
  databasePassword: z.string().min(1),
  seedPassword: z.string().min(12),
});

function generatedSecret(): string {
  return randomBytes(32).toString("base64url");
}

function generatedPassword(): string {
  return randomBytes(18).toString("base64url");
}

function createDesktopSecrets(): DesktopSecrets {
  return {
    sessionSecret: generatedSecret(),
    bootstrapSecret: generatedSecret(),
    supportAccessSecret: generatedSecret(),
    guestAccessSecret: generatedSecret(),
    recoveryDeliverySecret: generatedSecret(),
    controlSecret: generatedSecret(),
    databasePassword: generatedSecret(),
    seedPassword: generatedPassword(),
  };
}

export async function loadOrCreateDesktopSecrets(
  secretsFilePath: string,
): Promise<DesktopSecrets> {
  if (existsSync(secretsFilePath)) {
    const raw = await readFile(secretsFilePath, "utf8");
    return desktopSecretsSchema.parse(JSON.parse(raw));
  }
  const secrets = createDesktopSecrets();
  await writeFile(secretsFilePath, `${JSON.stringify(secrets, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return secrets;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-secrets.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/desktop-secrets.ts apps/desktop/src/shared/desktop-secrets.test.ts
git commit -m "feat(desktop): add persisted per-install desktop secrets"
```

---

## Task 4: `desktop-config.ts` — build the desktop's `DemoConfig`

**Files:**
- Create: `apps/desktop/src/shared/desktop-config.ts`
- Create: `apps/desktop/src/shared/desktop-config.test.ts`

**Interfaces:**
- Consumes: `import type { DemoConfig } from "../../../../scripts/demo-config.js"` (type-only — safe, see Global Constraints).
- Produces: `DESKTOP_POSTGRES_PORT`, `DESKTOP_POSTGRES_USERNAME`, `DESKTOP_CONTROL_PORT` constants and `buildDesktopDemoConfig(postgresPassword: string, seedPassword: string): DemoConfig`, consumed by Tasks 12 and 13. The literal values `"rms_demo"` and `"MISE_LOCAL_SYNTHETIC_DEMO_V1"` **must** stay equal to `scripts/demo-config.ts`'s exported `DEMO_DATABASE_NAME` and `DEMO_DATABASE_MARKER` (confirmed current values by reading that file) — this is a value import that would otherwise cross the `rootDir` boundary (see Global Constraints), so it is a literal here instead, flagged with a comment.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/desktop-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildDesktopDemoConfig,
  DESKTOP_POSTGRES_PORT,
  DESKTOP_POSTGRES_USERNAME,
} from "./desktop-config.js";

describe("buildDesktopDemoConfig", () => {
  it("builds a loopback database URL on the desktop postgres port with the desktop username", () => {
    const config = buildDesktopDemoConfig("plain-password", "a-seed-password-1");

    expect(config.databaseHost).toBe("127.0.0.1");
    expect(config.databasePort).toBe(DESKTOP_POSTGRES_PORT);
    expect(config.databaseName).toBe("rms_demo");
    expect(config.databaseMarker).toBe("MISE_LOCAL_SYNTHETIC_DEMO_V1");
    expect(config.databaseUrl).toBe(
      `postgresql://${DESKTOP_POSTGRES_USERNAME}:plain-password@127.0.0.1:${DESKTOP_POSTGRES_PORT}/rms_demo`,
    );
  });

  it("points the admin URL at the postgres maintenance database", () => {
    const config = buildDesktopDemoConfig("plain-password", "a-seed-password-1");

    expect(new URL(config.adminDatabaseUrl).pathname).toBe("/postgres");
  });

  it("URL-encodes special characters in the password", () => {
    const config = buildDesktopDemoConfig("p@ss/word?", "a-seed-password-1");

    expect(new URL(config.databaseUrl).password).toBe(
      encodeURIComponent("p@ss/word?"),
    );
  });

  it("carries the seed password through for seedDemo to use", () => {
    const config = buildDesktopDemoConfig("plain-password", "a-seed-password-1");

    expect(config.seedPassword).toBe("a-seed-password-1");
  });

  it("binds the launcher to loopback on the fixed launcher port", () => {
    const config = buildDesktopDemoConfig("plain-password", "a-seed-password-1");

    expect(config.launcherHost).toBe("127.0.0.1");
    expect(config.launcherPort).toBe(4170);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-config.test.ts
```

Expected: FAIL — `./desktop-config.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/shared/desktop-config.ts`:

```ts
import type { DemoConfig } from "../../../../scripts/demo-config.js";

export const DESKTOP_POSTGRES_PORT = 5433;
export const DESKTOP_POSTGRES_USERNAME = "mise_desktop";
export const DESKTOP_CONTROL_PORT = 4172;

// These two literals must stay equal to scripts/demo-config.ts's exported
// DEMO_DATABASE_NAME and DEMO_DATABASE_MARKER. They cannot be imported as
// values here without pulling scripts/demo-config.ts into this package's
// tsc build (see the "Why new shared modules..." note in the plan's Global
// Constraints).
const databaseName = "rms_demo";
const databaseMarker = "MISE_LOCAL_SYNTHETIC_DEMO_V1";

export function buildDesktopDemoConfig(
  postgresPassword: string,
  seedPassword: string,
): DemoConfig {
  const databaseUrl = new URL(
    `postgresql://${DESKTOP_POSTGRES_USERNAME}:${encodeURIComponent(postgresPassword)}@127.0.0.1:${String(DESKTOP_POSTGRES_PORT)}/${databaseName}`,
  );
  const adminDatabaseUrl = new URL(databaseUrl);
  adminDatabaseUrl.pathname = "/postgres";
  return {
    databaseUrl: databaseUrl.toString(),
    databaseName,
    databaseHost: "127.0.0.1",
    databasePort: DESKTOP_POSTGRES_PORT,
    adminDatabaseUrl: adminDatabaseUrl.toString(),
    databaseMarker,
    launcherHost: "127.0.0.1",
    launcherPort: 4170,
    seedPassword,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-config.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/desktop-config.ts apps/desktop/src/shared/desktop-config.test.ts
git commit -m "feat(desktop): add desktop-config to build the persistent DemoConfig"
```

---

## Task 5: `orchestrator-protocol.ts` — the ready-line contract

**Files:**
- Create: `apps/desktop/src/shared/orchestrator-protocol.ts`
- Create: `apps/desktop/src/shared/orchestrator-protocol.test.ts`

**Interfaces:**
- Produces: `DesktopOrchestratorReady` interface, `encodeReadyLine(ready: DesktopOrchestratorReady): string`, `parseReadyLine(line: string): DesktopOrchestratorReady | null`, consumed by Tasks 12 (encode) and 13 (parse).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/orchestrator-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encodeReadyLine, parseReadyLine } from "./orchestrator-protocol.js";

describe("encodeReadyLine / parseReadyLine", () => {
  it("round-trips a ready message", () => {
    const encoded = encodeReadyLine({
      launcherOrigin: "http://127.0.0.1:4170",
    });

    const parsed = parseReadyLine(encoded);

    expect(parsed).toEqual({ launcherOrigin: "http://127.0.0.1:4170" });
  });

  it("returns null for a line without the ready prefix", () => {
    expect(parseReadyLine("[demo:api] listening on 3000")).toBeNull();
  });

  it("returns null for a ready-prefixed line with malformed JSON", () => {
    expect(parseReadyLine("MISE_DESKTOP_READY {not json")).toBeNull();
  });

  it("returns null for a ready-prefixed line missing launcherOrigin", () => {
    expect(parseReadyLine("MISE_DESKTOP_READY {}")).toBeNull();
  });

  it("returns null when launcherOrigin is not a string", () => {
    expect(
      parseReadyLine('MISE_DESKTOP_READY {"launcherOrigin":5}'),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/orchestrator-protocol.test.ts
```

Expected: FAIL — `./orchestrator-protocol.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/shared/orchestrator-protocol.ts`:

```ts
export interface DesktopOrchestratorReady {
  readonly launcherOrigin: string;
}

const readyPrefix = "MISE_DESKTOP_READY ";

export function encodeReadyLine(ready: DesktopOrchestratorReady): string {
  return `${readyPrefix}${JSON.stringify(ready)}`;
}

export function parseReadyLine(line: string): DesktopOrchestratorReady | null {
  if (!line.startsWith(readyPrefix)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(line.slice(readyPrefix.length));
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("launcherOrigin" in payload) ||
    typeof (payload as { launcherOrigin: unknown }).launcherOrigin !== "string"
  ) {
    return null;
  }
  return { launcherOrigin: (payload as { launcherOrigin: string }).launcherOrigin };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/orchestrator-protocol.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/orchestrator-protocol.ts apps/desktop/src/shared/orchestrator-protocol.test.ts
git commit -m "feat(desktop): add the orchestrator ready-line protocol"
```

---

## Task 6: `desktop-seed-cache.ts` — seed once, reuse on later runs

**Files:**
- Create: `apps/desktop/src/shared/desktop-seed-cache.ts`
- Create: `apps/desktop/src/shared/desktop-seed-cache.test.ts`

**Interfaces:**
- Consumes: `import type { DemoSeedResult } from "../../../../scripts/demo-types.js"` (type-only — safe).
- Produces: `loadOrCreateSeedResult(seedResultFile: string, createSeedResult: () => Promise<DemoSeedResult>): Promise<DemoSeedResult>`, consumed by Task 12. This is what makes "seed only on first run, otherwise show the tester's own persisted data" (spec's "Data flow" section) a genuinely tested behavior rather than logic buried inside the untested orchestrator script.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/desktop-seed-cache.test.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DemoSeedResult } from "../../../../scripts/demo-types.js";
import { loadOrCreateSeedResult } from "./desktop-seed-cache.js";

function testSeedResult(): DemoSeedResult {
  return {
    businessCode: "dar-nedjma-demo",
    businessName: "Dar Nedjma Hospitality",
    restaurantName: "Dar Nedjma",
    branchName: "Hydra",
    roles: [
      {
        key: "owner",
        label: "Owner / administrator",
        displayName: "Nadia Cheriet",
        email: "nadia.cheriet@dar-nedjma.demo",
        target: "administration",
        password: "test-password-value",
      },
    ],
    customerUrls: [
      { tableCode: "T-12", url: "http://127.0.0.1:5174/t/abc123" },
    ],
    scenario: ["Guest scans the T-12 table QR and submits a menu order."],
  };
}

describe("loadOrCreateSeedResult", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mise-desktop-seed-cache-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("calls createSeedResult and persists it when no cache file exists", async () => {
    const file = join(directory, "seed-result.json");
    const created = testSeedResult();
    let calls = 0;
    const createSeedResult = async (): Promise<DemoSeedResult> => {
      calls += 1;
      return created;
    };

    const result = await loadOrCreateSeedResult(file, createSeedResult);

    expect(calls).toBe(1);
    expect(result).toEqual(created);
    expect(existsSync(file)).toBe(true);
  });

  it("reads the cached result on a later call without calling createSeedResult again", async () => {
    const file = join(directory, "seed-result.json");
    const created = testSeedResult();
    await loadOrCreateSeedResult(file, async () => created);
    let calls = 0;

    const result = await loadOrCreateSeedResult(file, async () => {
      calls += 1;
      return created;
    });

    expect(calls).toBe(0);
    expect(result).toEqual(created);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-seed-cache.test.ts
```

Expected: FAIL — `./desktop-seed-cache.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/shared/desktop-seed-cache.ts`:

```ts
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { DemoSeedResult } from "../../../../scripts/demo-types.js";

const demoSeedResultSchema = z.object({
  businessCode: z.string(),
  businessName: z.string(),
  restaurantName: z.string(),
  branchName: z.string(),
  roles: z.array(
    z.object({
      key: z.enum(["owner", "general-staff", "kitchen", "cashier"]),
      label: z.string(),
      displayName: z.string(),
      email: z.string(),
      target: z.enum(["administration", "staff"]),
      password: z.string(),
    }),
  ),
  customerUrls: z.array(z.object({ tableCode: z.string(), url: z.string() })),
  scenario: z.array(z.string()),
});

export async function loadOrCreateSeedResult(
  seedResultFile: string,
  createSeedResult: () => Promise<DemoSeedResult>,
): Promise<DemoSeedResult> {
  if (existsSync(seedResultFile)) {
    const raw = await readFile(seedResultFile, "utf8");
    return demoSeedResultSchema.parse(JSON.parse(raw));
  }
  const result = await createSeedResult();
  await writeFile(seedResultFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/shared/desktop-seed-cache.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/desktop-seed-cache.ts apps/desktop/src/shared/desktop-seed-cache.test.ts
git commit -m "feat(desktop): add desktop-seed-cache so seeding only happens on first run"
```

---

## Task 7: Adapt `scripts/demo-postgres.ts` for bundled binaries and a persistent cluster

**Files:**
- Modify: `scripts/demo-postgres.ts`
- Modify: `scripts/demo-postgres.test.ts`

**Interfaces:**
- Produces: exported `bundledBinaryCandidate(binary: string): string | undefined`, exported `isExistingPostgresCluster(clusterDirectory: string): boolean`, exported `startPersistentDemoPostgres(config: DemoConfig, clusterDirectory: string): Promise<PersistentDemoPostgresRuntime>`, consumed by Task 12.
- This task changes `findPostgresBinary`'s search order but is designed to be a no-op for every existing caller (`startIsolatedDemoPostgres`, used by `dev-demo.ts` and `real-e2e-harness.ts`) when `process.resourcesPath` is unset, which is always true outside Electron.

- [ ] **Step 1: Write the failing tests**

Edit `scripts/demo-postgres.test.ts` — add these `describe` blocks (keep the existing `selectDemoPostgresMode` block as-is):

```ts
import { join } from "node:path";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  bundledBinaryCandidate,
  isExistingPostgresCluster,
  selectDemoPostgresMode,
  type DemoPostgresCapabilities,
} from "./demo-postgres.js";
```

(Add the new imports to the existing import line rather than duplicating it, and add the two blocks below anywhere after the existing `describe("selectDemoPostgresMode", ...)` block:)

```ts
describe("bundledBinaryCandidate", () => {
  afterEach(() => {
    delete (process as { resourcesPath?: string }).resourcesPath;
  });

  it("returns undefined outside Electron, where resourcesPath is unset", () => {
    expect(bundledBinaryCandidate("initdb")).toBeUndefined();
  });

  it("resolves inside resourcesPath/postgresql/bin when running under Electron", () => {
    (process as { resourcesPath?: string }).resourcesPath = join(
      "C:\\",
      "App",
      "resources",
    );

    const result = bundledBinaryCandidate("initdb");

    expect(result).toBe(
      join("C:\\", "App", "resources", "postgresql", "bin", "initdb.exe"),
    );
  });
});

describe("isExistingPostgresCluster", () => {
  let directory = "";

  afterEach(() => {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("is false for a directory with no PG_VERSION file", () => {
    directory = mkdtempSync(join(tmpdir(), "mise-postgres-cluster-"));

    expect(isExistingPostgresCluster(directory)).toBe(false);
  });

  it("is true once a PG_VERSION file exists", () => {
    directory = mkdtempSync(join(tmpdir(), "mise-postgres-cluster-"));
    writeFileSync(join(directory, "PG_VERSION"), "18\n", "utf8");

    expect(isExistingPostgresCluster(directory)).toBe(true);
  });

  it("is false for a directory that does not exist at all", () => {
    expect(isExistingPostgresCluster(join(tmpdir(), "does-not-exist-xyz"))).toBe(
      false,
    );
  });
});
```

Also add `afterEach` to the top-level vitest import if not already present:

```ts
import { afterEach, describe, expect, it } from "vitest";
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run scripts/demo-postgres.test.ts
```

Expected: FAIL — `bundledBinaryCandidate` and `isExistingPostgresCluster` are not exported yet.

- [ ] **Step 3: Adapt `findPostgresBinary` and add `isExistingPostgresCluster`**

In `scripts/demo-postgres.ts`, replace this existing block:

```ts
function postgresBinaryName(binary: string): string {
  return process.platform === "win32" ? `${binary}.exe` : binary;
}

function existingWindowsBinaryCandidates(binary: string): readonly string[] {
```

with (adding the new exported function right after `postgresBinaryName`):

```ts
function postgresBinaryName(binary: string): string {
  return process.platform === "win32" ? `${binary}.exe` : binary;
}

export function bundledBinaryCandidate(binary: string): string | undefined {
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath !== "string" || resourcesPath.length === 0) {
    return undefined;
  }
  return join(resourcesPath, "postgresql", "bin", postgresBinaryName(binary));
}

function existingWindowsBinaryCandidates(binary: string): readonly string[] {
```

Then replace the existing `findPostgresBinary` function:

```ts
async function findPostgresBinary(binary: string): Promise<string | undefined> {
  const candidates =
    process.platform === "win32"
      ? existingWindowsBinaryCandidates(binary)
      : [postgresBinaryName(binary)];
  const candidate = candidates.find((path) => existsSync(path));
```

with:

```ts
async function findPostgresBinary(binary: string): Promise<string | undefined> {
  const bundled = bundledBinaryCandidate(binary);
  const candidates = [
    ...(bundled ? [bundled] : []),
    ...(process.platform === "win32"
      ? existingWindowsBinaryCandidates(binary)
      : [postgresBinaryName(binary)]),
  ];
  const candidate = candidates.find((path) => existsSync(path));
```

(The rest of `findPostgresBinary` — the `where.exe`/`which` fallback — is unchanged.)

Add `isExistingPostgresCluster` near the top of the file, after the existing constant declarations (`localPostgresVersion`, `loopbackHost`):

```ts
export function isExistingPostgresCluster(clusterDirectory: string): boolean {
  return existsSync(join(clusterDirectory, "PG_VERSION"));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run scripts/demo-postgres.test.ts
```

Expected: PASS (all `selectDemoPostgresMode`, `bundledBinaryCandidate`, and `isExistingPostgresCluster` tests).

- [ ] **Step 5: Add `startPersistentDemoPostgres`**

Add this function to `scripts/demo-postgres.ts`, after `startIsolatedDemoPostgres`:

```ts
export interface PersistentDemoPostgresRuntime {
  readonly config: DemoConfig;
  readonly mode: "persistent";
  close(): Promise<void>;
}

export async function startPersistentDemoPostgres(
  config: DemoConfig,
  clusterDirectory: string,
): Promise<PersistentDemoPostgresRuntime> {
  const initdb = await findPostgresBinary("initdb");
  const pgCtl = await findPostgresBinary("pg_ctl");
  if (!initdb || !pgCtl) {
    throw new DemoPostgresError("locating PostgreSQL 18.1 binaries");
  }
  const targetUrl = new URL(config.databaseUrl);
  const username = decodedUrlComponent(
    targetUrl.username || "rms",
    "reading the PostgreSQL username",
  );
  const password = decodedUrlComponent(
    targetUrl.password,
    "reading the PostgreSQL password",
  );
  const runtimeConfig = isolatedConfig(
    config,
    config.databasePort,
    username,
    password,
  );

  if (!isExistingPostgresCluster(clusterDirectory)) {
    const passwordFile = join(
      clusterDirectory,
      "..",
      ".mise-desktop-initdb-password",
    );
    await writeFile(passwordFile, `${password}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      await runPostgresControlCommand(
        initdb,
        [
          "-D",
          clusterDirectory,
          `--username=${username}`,
          `--pwfile=${passwordFile}`,
          "--auth=scram-sha-256",
          "--no-locale",
          "--encoding=UTF8",
        ],
        "initializing the persistent PostgreSQL cluster",
      );
    } finally {
      await rm(passwordFile, { force: true });
    }
  }

  await runPostgresControlCommand(
    pgCtl,
    [
      "-D",
      clusterDirectory,
      "-o",
      `-h ${loopbackHost} -p ${String(config.databasePort)}`,
      "-w",
      "start",
    ],
    "starting the persistent PostgreSQL cluster",
  );
  await waitForDatabase(runtimeConfig.adminDatabaseUrl);

  let closed = false;
  return {
    config: runtimeConfig,
    mode: "persistent",
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await runPostgresControlCommand(
        pgCtl,
        ["-D", clusterDirectory, "-m", "fast", "-w", "stop"],
        "stopping the persistent PostgreSQL cluster",
      );
    },
  };
}
```

This reuses `findPostgresBinary`, `decodedUrlComponent`, `isolatedConfig`, `runPostgresControlCommand`, `waitForDatabase`, `loopbackHost`, and `DemoPostgresError` — all already defined earlier in this same file — and `writeFile`/`rm` — already imported at the top of the file for `startIsolatedDemoPostgres`. No new imports are needed.

- [ ] **Step 6: Typecheck and run the full test file**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec tsc --noEmit -p tsconfig.check.json
corepack pnpm exec vitest run scripts/demo-postgres.test.ts
```

Expected: both succeed with no errors. `startPersistentDemoPostgres` itself has no dedicated unit test (it spawns real `initdb`/`pg_ctl`, matching this file's existing precedent — `startIsolatedDemoPostgres` also has no direct test). It is exercised for real in Task 12's manual verification.

- [ ] **Step 7: Commit**

```bash
git add scripts/demo-postgres.ts scripts/demo-postgres.test.ts
git commit -m "feat(demo): support bundled PostgreSQL binaries and a persistent cluster"
```

---

## Task 8: Adapt `scripts/demo-launcher.ts` for real sign-in links

**Files:**
- Modify: `scripts/demo-launcher.ts`
- Create: `scripts/demo-launcher.test.ts`

**Interfaces:**
- Produces: `DemoLauncherOptions.roleLinkMode?: "auto-login" | "direct-sign-in"` (optional, defaults to today's `"auto-login"` behavior — `dev-demo.ts`'s existing call site is unmodified and therefore unaffected), exported `page(options: DemoLauncherOptions): string`, exported `roleCardHref(role: DemoRoleCredential, options: DemoLauncherOptions): { readonly href: string; readonly target?: string }`. Consumed by Task 12 with `roleLinkMode: "direct-sign-in"`.

- [ ] **Step 1: Write the failing test**

Create `scripts/demo-launcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { page, roleCardHref, type DemoLauncherOptions } from "./demo-launcher.js";
import type { DemoSeedResult } from "./demo-types.js";

function testResult(): DemoSeedResult {
  return {
    businessCode: "dar-nedjma-demo",
    businessName: "Dar Nedjma Hospitality",
    restaurantName: "Dar Nedjma",
    branchName: "Hydra",
    roles: [
      {
        key: "owner",
        label: "Owner / administrator",
        displayName: "Nadia Cheriet",
        email: "nadia.cheriet@dar-nedjma.demo",
        target: "administration",
        password: "test-password-value",
      },
      {
        key: "kitchen",
        label: "Kitchen staff",
        displayName: "Yacine Bensaid",
        email: "yacine.bensaid@dar-nedjma.demo",
        target: "staff",
        password: "test-password-value",
      },
    ],
    customerUrls: [
      { tableCode: "T-12", url: "http://127.0.0.1:5174/t/abc123" },
    ],
    scenario: ["Guest scans the T-12 table QR and submits a menu order."],
  };
}

function testOptions(
  overrides: Partial<DemoLauncherOptions> = {},
): DemoLauncherOptions {
  return {
    result: testResult(),
    apiOrigin: "http://127.0.0.1:3000",
    adminOrigin: "http://127.0.0.1:5175",
    staffOrigin: "http://127.0.0.1:5173",
    recoveryOrigin: "http://127.0.0.1:4171",
    host: "127.0.0.1",
    port: 4170,
    ...overrides,
  };
}

describe("roleCardHref", () => {
  it("links to the auto-login launch path by default", () => {
    const options = testOptions();

    const link = roleCardHref(options.result.roles[0], options);

    expect(link.href).toBe("/launch/owner");
    expect(link.target).toBeUndefined();
  });

  it("links to the real staff sign-in screen in direct-sign-in mode", () => {
    const options = testOptions({ roleLinkMode: "direct-sign-in" });

    const link = roleCardHref(options.result.roles[1], options);

    expect(link.href).toBe("http://127.0.0.1:5173/auth/sign-in");
    expect(link.target).toBe("_blank");
  });

  it("links to the real administration sign-in screen for the owner role in direct-sign-in mode", () => {
    const options = testOptions({ roleLinkMode: "direct-sign-in" });

    const link = roleCardHref(options.result.roles[0], options);

    expect(link.href).toBe("http://127.0.0.1:5175/auth/sign-in");
    expect(link.target).toBe("_blank");
  });
});

describe("page", () => {
  it("renders auto-login launch links by default and keeps the automation helper", () => {
    const html = page(testOptions());

    expect(html).toContain('href="/launch/owner"');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("corepack pnpm demo:contexts");
  });

  it("renders direct sign-in links with target=_blank and drops the automation helper", () => {
    const html = page(testOptions({ roleLinkMode: "direct-sign-in" }));

    expect(html).toContain(
      'href="http://127.0.0.1:5175/auth/sign-in" target="_blank"',
    );
    expect(html).not.toContain("corepack pnpm demo:contexts");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run scripts/demo-launcher.test.ts
```

Expected: FAIL — `page` and `roleCardHref` are not exported yet.

- [ ] **Step 3: Implement `roleCardHref` and export `page`**

In `scripts/demo-launcher.ts`, add this new field to `DemoLauncherOptions` (after `readonly port: number;`):

```ts
  readonly roleLinkMode?: "auto-login" | "direct-sign-in";
```

Add this new exported function right after the existing `targetOrigin` function:

```ts
export function roleCardHref(
  role: DemoRoleCredential,
  options: DemoLauncherOptions,
): { readonly href: string; readonly target?: string } {
  if (options.roleLinkMode === "direct-sign-in") {
    return {
      href: `${targetOrigin(role, options)}/auth/sign-in`,
      target: "_blank",
    };
  }
  return { href: `/launch/${encodeURIComponent(role.key)}` };
}
```

Replace the existing `roleCards` construction inside `page()`:

```ts
  const roleCards = result.roles
    .map(
      (role) => `
        <li class="role-card">
          <div class="role-mark" aria-hidden="true">${escapeHtml(role.label.slice(0, 1))}</div>
          <div class="role-copy">
            <span class="role-label">${escapeHtml(role.label)}</span>
            <strong>${escapeHtml(role.displayName)}</strong>
            <code>${escapeHtml(role.email)}</code>
          </div>
          <a class="button button-small" href="/launch/${encodeURIComponent(role.key)}">Open ${escapeHtml(role.target)}</a>
        </li>`,
    )
    .join("");
```

with:

```ts
  const roleCards = result.roles
    .map((role) => {
      const link = roleCardHref(role, options);
      const targetAttribute = link.target
        ? ` target="${link.target}" rel="noreferrer"`
        : "";
      return `
        <li class="role-card">
          <div class="role-mark" aria-hidden="true">${escapeHtml(role.label.slice(0, 1))}</div>
          <div class="role-copy">
            <span class="role-label">${escapeHtml(role.label)}</span>
            <strong>${escapeHtml(role.displayName)}</strong>
            <code>${escapeHtml(role.email)}</code>
          </div>
          <a class="button button-small" href="${escapeHtml(link.href)}"${targetAttribute}>Open ${escapeHtml(role.target)}</a>
        </li>`;
    })
    .join("");
```

Replace the hardcoded safety/automation section at the bottom of the returned template:

```ts
        <section style="background: var(--canvas);" aria-labelledby="safety-title">
          <div class="warning"><strong id="safety-title">Local-only safety boundary</strong>Use separate browser contexts for each role. Reset by stopping this run and starting <code>corepack pnpm dev:demo</code> again; the isolated demo database is preserved when you stop.</div>
          <div class="section-heading" style="margin-bottom: 0;">
            <div><p>Automation helper</p><h3>Open isolated contexts</h3></div>
            <code>corepack pnpm demo:contexts</code>
          </div>
        </section>
```

with a reference to a new `${safetySection}` template variable:

```ts
        ${safetySection}
```

and define `safetySection` earlier in `page()`, alongside the existing `roleCards`/`customerLinks`/`scenarioItems` local variables:

```ts
  const safetySection =
    options.roleLinkMode === "direct-sign-in"
      ? `<section style="background: var(--canvas);" aria-labelledby="safety-title">
          <div class="warning"><strong id="safety-title">Local-only safety boundary</strong>Each role opens in its own window using the real sign-in screen. No account is logged in automatically. Use the app's <strong>Reset demo data</strong> menu action to start over.</div>
        </section>`
      : `<section style="background: var(--canvas);" aria-labelledby="safety-title">
          <div class="warning"><strong id="safety-title">Local-only safety boundary</strong>Use separate browser contexts for each role. Reset by stopping this run and starting <code>corepack pnpm dev:demo</code> again; the isolated demo database is preserved when you stop.</div>
          <div class="section-heading" style="margin-bottom: 0;">
            <div><p>Automation helper</p><h3>Open isolated contexts</h3></div>
            <code>corepack pnpm demo:contexts</code>
          </div>
        </section>`;
```

Finally, change `function page(options: DemoLauncherOptions): string {` to `export function page(options: DemoLauncherOptions): string {`.

- [ ] **Step 4: Block the auto-login route in direct-sign-in mode**

In `handleRequest`, find:

```ts
  const launchMatch = /^\/launch\/([a-z-]+)$/.exec(requestUrl.pathname);
  if (launchMatch) {
```

and change it to:

```ts
  const launchMatch = /^\/launch\/([a-z-]+)$/.exec(requestUrl.pathname);
  if (launchMatch && options.roleLinkMode !== "direct-sign-in") {
```

(This keeps the auto-login backdoor entirely unreachable in the desktop build, matching the spec's "Real sign-in, not a shortcut" decision — a request to `/launch/<role>` in direct-sign-in mode now falls through to the existing final `404 Not found` response.)

- [ ] **Step 5: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run scripts/demo-launcher.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Confirm the existing `dev:demo` behavior is unchanged**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec tsc --noEmit -p tsconfig.check.json
```

Expected: no type errors (confirms `dev-demo.ts`'s existing `startDemoLauncher({...})` call — which doesn't pass `roleLinkMode` — still type-checks against the now-optional field).

- [ ] **Step 7: Commit**

```bash
git add scripts/demo-launcher.ts scripts/demo-launcher.test.ts
git commit -m "feat(demo): support real sign-in links in the demo launcher"
```

---

## Task 9: `window-registry.ts` — track open role windows

**Files:**
- Create: `apps/desktop/src/window-registry.ts`
- Create: `apps/desktop/src/window-registry.test.ts`

**Interfaces:**
- Produces: `RoleWindowHandle` interface, `WindowRegistry` class with `register`, `unregister`, `list`, `closeAll`, consumed by Tasks 10, 11, 13.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/window-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WindowRegistry, type RoleWindowHandle } from "./window-registry.js";

function testHandle(
  id: number,
  overrides: Partial<RoleWindowHandle> = {},
): RoleWindowHandle & { closed: boolean; focused: boolean } {
  const handle = {
    id,
    roleKey: "kitchen",
    label: `Window ${String(id)}`,
    closed: false,
    focused: false,
    close(): void {
      handle.closed = true;
    },
    focus(): void {
      handle.focused = true;
    },
    ...overrides,
  };
  return handle;
}

describe("WindowRegistry", () => {
  it("lists nothing when empty", () => {
    const registry = new WindowRegistry();

    expect(registry.list()).toEqual([]);
  });

  it("lists every registered window", () => {
    const registry = new WindowRegistry();
    const first = testHandle(1);
    const second = testHandle(2);

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((handle) => handle.id)).toEqual([1, 2]);
  });

  it("removes a window on unregister", () => {
    const registry = new WindowRegistry();
    registry.register(testHandle(1));
    registry.register(testHandle(2));

    registry.unregister(1);

    expect(registry.list().map((handle) => handle.id)).toEqual([2]);
  });

  it("closes and forgets every window on closeAll", () => {
    const registry = new WindowRegistry();
    const first = testHandle(1);
    const second = testHandle(2);
    registry.register(first);
    registry.register(second);

    registry.closeAll();

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
    expect(registry.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/window-registry.test.ts
```

Expected: FAIL — `./window-registry.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/window-registry.ts`:

```ts
export interface RoleWindowHandle {
  readonly id: number;
  readonly roleKey: string;
  readonly label: string;
  close(): void;
  focus(): void;
}

export class WindowRegistry {
  #windows = new Map<number, RoleWindowHandle>();

  register(handle: RoleWindowHandle): void {
    this.#windows.set(handle.id, handle);
  }

  unregister(id: number): void {
    this.#windows.delete(id);
  }

  list(): readonly RoleWindowHandle[] {
    return [...this.#windows.values()];
  }

  closeAll(): void {
    for (const handle of this.#windows.values()) {
      handle.close();
    }
    this.#windows.clear();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/window-registry.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/window-registry.ts apps/desktop/src/window-registry.test.ts
git commit -m "feat(desktop): add WindowRegistry to track open role windows"
```

---

## Task 10: `tray-menu.ts` — the tray/window-list menu template

**Files:**
- Create: `apps/desktop/src/tray-menu.ts`
- Create: `apps/desktop/src/tray-menu.test.ts`

**Interfaces:**
- Consumes: `RoleWindowHandle` from Task 9 (`./window-registry.js`); `type { MenuItemConstructorOptions } from "electron"` (type-only import of a real npm dependency — safe; not a `scripts/` cross-boundary concern, see Global Constraints).
- Produces: `TrayMenuActions` interface, `buildTrayMenuTemplate(windows: readonly RoleWindowHandle[], actions: TrayMenuActions): MenuItemConstructorOptions[]`, consumed by Task 13.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/tray-menu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTrayMenuTemplate, type TrayMenuActions } from "./tray-menu.js";
import type { RoleWindowHandle } from "./window-registry.js";

function noopActions(overrides: Partial<TrayMenuActions> = {}): TrayMenuActions {
  return {
    openHome: () => undefined,
    resetDemoData: () => undefined,
    quit: () => undefined,
    ...overrides,
  };
}

function testHandle(overrides: Partial<RoleWindowHandle> = {}): RoleWindowHandle {
  return {
    id: 1,
    roleKey: "kitchen",
    label: "Kitchen staff",
    close: () => undefined,
    focus: () => undefined,
    ...overrides,
  };
}

describe("buildTrayMenuTemplate", () => {
  it("shows a disabled placeholder when no role windows are open", () => {
    const template = buildTrayMenuTemplate([], noopActions());

    const placeholder = template.find(
      (item) => item.label === "No role windows open",
    );

    expect(placeholder).toBeDefined();
    expect(placeholder?.enabled).toBe(false);
  });

  it("lists each open role window by its label", () => {
    const template = buildTrayMenuTemplate([testHandle()], noopActions());

    expect(template.some((item) => item.label === "Kitchen staff")).toBe(true);
  });

  it("focuses the matching window when its menu item is clicked", () => {
    let focused = false;
    const handle = testHandle({ focus: () => (focused = true) });

    const template = buildTrayMenuTemplate([handle], noopActions());
    const item = template.find((entry) => entry.label === "Kitchen staff");
    (item?.click as (() => void) | undefined)?.();

    expect(focused).toBe(true);
  });

  it("invokes resetDemoData when the reset item is clicked", () => {
    let resetCalled = false;
    const actions = noopActions({ resetDemoData: () => (resetCalled = true) });

    const template = buildTrayMenuTemplate([], actions);
    const item = template.find((entry) => entry.label === "Reset demo data");
    (item?.click as (() => void) | undefined)?.();

    expect(resetCalled).toBe(true);
  });

  it("invokes quit when the quit item is clicked", () => {
    let quitCalled = false;
    const actions = noopActions({ quit: () => (quitCalled = true) });

    const template = buildTrayMenuTemplate([], actions);
    const item = template.find((entry) => entry.label === "Quit");
    (item?.click as (() => void) | undefined)?.();

    expect(quitCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/tray-menu.test.ts
```

Expected: FAIL — `./tray-menu.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/tray-menu.ts`:

```ts
import type { MenuItemConstructorOptions } from "electron";
import type { RoleWindowHandle } from "./window-registry.js";

export interface TrayMenuActions {
  readonly openHome: () => void;
  readonly resetDemoData: () => void;
  readonly quit: () => void;
}

export function buildTrayMenuTemplate(
  windows: readonly RoleWindowHandle[],
  actions: TrayMenuActions,
): MenuItemConstructorOptions[] {
  const windowItems: MenuItemConstructorOptions[] =
    windows.length === 0
      ? [{ label: "No role windows open", enabled: false }]
      : windows.map((handle) => ({
          label: handle.label,
          click: () => handle.focus(),
        }));
  return [
    { label: "Open home window", click: () => actions.openHome() },
    { type: "separator" },
    ...windowItems,
    { type: "separator" },
    { label: "Reset demo data", click: () => actions.resetDemoData() },
    { type: "separator" },
    { label: "Quit", click: () => actions.quit() },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/tray-menu.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/tray-menu.ts apps/desktop/src/tray-menu.test.ts
git commit -m "feat(desktop): add the tray menu template"
```

---

## Task 11: `reset-demo-data.ts` — the reset orchestration sequence

**Files:**
- Create: `apps/desktop/src/reset-demo-data.ts`
- Create: `apps/desktop/src/reset-demo-data.test.ts`

**Interfaces:**
- Produces: `ResetDemoDataDependencies` interface, `performDemoDataReset(dependencies: ResetDemoDataDependencies): Promise<void>`, consumed by Task 13.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/reset-demo-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { performDemoDataReset } from "./reset-demo-data.js";

describe("performDemoDataReset", () => {
  it("closes role windows, then requests the reset, then reopens the home window, in order", async () => {
    const calls: string[] = [];

    await performDemoDataReset({
      closeRoleWindows: () => calls.push("close"),
      requestReset: async () => {
        calls.push("request");
      },
      reopenHomeWindow: () => calls.push("reopen"),
    });

    expect(calls).toEqual(["close", "request", "reopen"]);
  });

  it("does not reopen the home window when the reset request fails", async () => {
    const calls: string[] = [];

    await expect(
      performDemoDataReset({
        closeRoleWindows: () => calls.push("close"),
        requestReset: async () => {
          calls.push("request");
          throw new Error("reset failed");
        },
        reopenHomeWindow: () => calls.push("reopen"),
      }),
    ).rejects.toThrow("reset failed");

    expect(calls).toEqual(["close", "request"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/reset-demo-data.test.ts
```

Expected: FAIL — `./reset-demo-data.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/reset-demo-data.ts`:

```ts
export interface ResetDemoDataDependencies {
  closeRoleWindows(): void;
  requestReset(): Promise<void>;
  reopenHomeWindow(): void;
}

export async function performDemoDataReset(
  dependencies: ResetDemoDataDependencies,
): Promise<void> {
  dependencies.closeRoleWindows();
  await dependencies.requestReset();
  dependencies.reopenHomeWindow();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/src/reset-demo-data.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/reset-demo-data.ts apps/desktop/src/reset-demo-data.test.ts
git commit -m "feat(desktop): add the reset-demo-data orchestration sequence"
```

---

## Task 12: `scripts/desktop-orchestrator.ts` — the orchestration entrypoint

**Files:**
- Create: `scripts/desktop-orchestrator.ts`

**Interfaces:**
- Consumes (all reused unchanged, matching `scripts/dev-demo.ts`'s import style): `startManagedDemoProcess`, `waitForHttp` from `./demo-process.js`; `startDemoLauncher` from `./demo-launcher.js` (with `roleLinkMode: "direct-sign-in"`); `startDemoRecoveryDelivery` from `./demo-recovery-delivery.js`; `startPersistentDemoPostgres` from `./demo-postgres.js` (Task 7); `resetDemoDatabase` — not called directly, see below; `seedDemo` from `./seed-demo.js`; `type DemoConfig` from `./demo-config.js`; `type DemoSeedResult` from `./demo-types.js`. Also consumes, via relative path into `apps/desktop/src/shared/` (Tasks 2–6): `resolveDesktopPaths`, `ensureDesktopDirectories`, `loadOrCreateDesktopSecrets`, `buildDesktopDemoConfig`, `DESKTOP_CONTROL_PORT`, `encodeReadyLine`, `loadOrCreateSeedResult`.
- Produces: a runnable script, invoked by `apps/desktop/src/main.ts` (Task 13) as a child process, that prints one `MISE_DESKTOP_READY {...}` line (via `encodeReadyLine`) to stdout once the launcher is reachable, and exposes an authenticated `POST /reset` HTTP endpoint on `127.0.0.1:4172`.
- No dedicated unit test file — matches this repository's existing precedent (`scripts/dev-demo.ts` and `scripts/real-e2e-harness.ts` have none either, because they spawn real child processes and a real PostgreSQL cluster). Verified manually in Step 3 below and again end-to-end in Task 15.

- [ ] **Step 1: Write the implementation**

Create `scripts/desktop-orchestrator.ts`:

```ts
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { writeFile } from "node:fs/promises";
import {
  DESKTOP_CONTROL_PORT,
  buildDesktopDemoConfig,
} from "../apps/desktop/src/shared/desktop-config.js";
import {
  ensureDesktopDirectories,
  resolveDesktopPaths,
} from "../apps/desktop/src/shared/desktop-paths.js";
import { loadOrCreateDesktopSecrets } from "../apps/desktop/src/shared/desktop-secrets.js";
import { loadOrCreateSeedResult } from "../apps/desktop/src/shared/desktop-seed-cache.js";
import { encodeReadyLine } from "../apps/desktop/src/shared/orchestrator-protocol.js";
import type { DemoConfig } from "./demo-config.js";
import { startDemoLauncher, type DemoLauncher } from "./demo-launcher.js";
import { startPersistentDemoPostgres } from "./demo-postgres.js";
import {
  startManagedDemoProcess,
  waitForHttp,
  type DemoProcessSpec,
  type ManagedDemoProcess,
} from "./demo-process.js";
import {
  startDemoRecoveryDelivery,
  type DemoRecoveryDelivery,
} from "./demo-recovery-delivery.js";
import { seedDemo } from "./seed-demo.js";
import type { DemoSeedResult } from "./demo-types.js";

const apiOrigin = "http://127.0.0.1:3000";
const staffOrigin = "http://127.0.0.1:5173";
const customerOrigin = "http://127.0.0.1:5174";
const adminOrigin = "http://127.0.0.1:5175";
const recoveryDeliveryOrigin = "http://127.0.0.1:4171";
const workerReadyMessage = "Worker process is ready; outbox dispatch is active";

interface DesktopSecretsLike {
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly recoveryDeliverySecret: string;
}

function runtimeEnvironment(
  config: DemoConfig,
  secrets: DesktopSecretsLike,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    DATABASE_URL: config.databaseUrl,
    SESSION_SECRET: secrets.sessionSecret,
    BOOTSTRAP_SECRET: secrets.bootstrapSecret,
    SUPPORT_ACCESS_SECRET: secrets.supportAccessSecret,
    GUEST_ACCESS_SECRET: secrets.guestAccessSecret,
    SESSION_COOKIE_SECURE: "false",
    WEB_ORIGIN: adminOrigin,
    STAFF_WEB_ORIGIN: staffOrigin,
    CUSTOMER_WEB_ORIGIN: customerOrigin,
    RECOVERY_DELIVERY_URL: `${recoveryDeliveryOrigin}/deliver`,
    RECOVERY_DELIVERY_SECRET: secrets.recoveryDeliverySecret,
    WORKER_ID: "mise-desktop-worker",
    LOG_LEVEL: "info",
    OUTBOX_LEASE_MS: "30000",
    OUTBOX_MAX_ATTEMPTS: "5",
    OUTBOX_RETENTION_DAYS: "90",
  };
}

function apiSpec(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): DemoProcessSpec {
  return {
    label: "api",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "api", "dist", "server.js")],
    cwd: repositoryRoot,
    env: environment,
    secrets,
  };
}

function workerSpec(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): DemoProcessSpec {
  return {
    label: "worker",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "worker", "dist", "worker.js")],
    cwd: repositoryRoot,
    env: environment,
    secrets,
  };
}

function previewSpecs(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): readonly DemoProcessSpec[] {
  const app = (name: string): string =>
    join(repositoryRoot, "apps", "web", name);
  const vite = (name: string): string =>
    join(app(name), "node_modules", "vite", "bin", "vite.js");
  return (
    [
      ["customer", customerOrigin],
      ["staff", staffOrigin],
      ["admin", adminOrigin],
    ] as const
  ).map(([name, origin]) => ({
    label: name,
    command: process.execPath,
    args: [
      vite(name),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
    ],
    cwd: app(name),
    env: environment,
    secrets,
  }));
}

async function main(): Promise<void> {
  const appDataDirectory = process.env.MISE_DESKTOP_APP_DATA_DIR;
  const repositoryRoot = process.env.MISE_DESKTOP_REPOSITORY_ROOT;
  if (!appDataDirectory || !repositoryRoot) {
    throw new Error(
      "MISE_DESKTOP_APP_DATA_DIR and MISE_DESKTOP_REPOSITORY_ROOT are required.",
    );
  }
  const paths = resolveDesktopPaths(appDataDirectory);
  await ensureDesktopDirectories(paths);
  const secrets = await loadOrCreateDesktopSecrets(paths.secretsFile);
  const config = buildDesktopDemoConfig(
    secrets.databasePassword,
    secrets.seedPassword,
  );

  const postgres = await startPersistentDemoPostgres(
    config,
    paths.postgresDataDirectory,
  );
  const environment = runtimeEnvironment(postgres.config, secrets);
  const secretList = [
    secrets.sessionSecret,
    secrets.bootstrapSecret,
    secrets.supportAccessSecret,
    secrets.guestAccessSecret,
    secrets.recoveryDeliverySecret,
    secrets.databasePassword,
    secrets.seedPassword,
  ];

  let api: ManagedDemoProcess | undefined;
  let worker: ManagedDemoProcess | undefined;
  const previewProcesses: ManagedDemoProcess[] = [];
  let recoveryDelivery: DemoRecoveryDelivery | undefined;
  let launcher: DemoLauncher | undefined;
  let controlServer: Server | undefined;
  let seedResult: DemoSeedResult | undefined;

  const runSeed = (): Promise<DemoSeedResult> =>
    seedDemo({
      config: postgres.config,
      password: secrets.seedPassword,
      sessionSecret: secrets.sessionSecret,
      guestAccessSecret: secrets.guestAccessSecret,
      customerWebOrigin: customerOrigin,
    });

  const startApiAndWorker = async (): Promise<void> => {
    api = startManagedDemoProcess(
      apiSpec(repositoryRoot, environment, secretList),
    );
    await waitForHttp(`${apiOrigin}/health/live`);
    await waitForHttp(`${apiOrigin}/health/ready`);
    worker = startManagedDemoProcess(
      workerSpec(repositoryRoot, environment, secretList),
    );
    await worker.waitForText(workerReadyMessage);
  };

  const stopApiAndWorker = async (): Promise<void> => {
    await worker?.terminate();
    await api?.terminate();
    worker = undefined;
    api = undefined;
  };

  const performReset = async (): Promise<void> => {
    await stopApiAndWorker();
    seedResult = await runSeed();
    await writeFile(
      paths.seedResultFile,
      `${JSON.stringify(seedResult, null, 2)}\n`,
      "utf8",
    );
    await startApiAndWorker();
    await launcher?.close();
    launcher = await startDemoLauncher({
      result: seedResult,
      apiOrigin,
      adminOrigin,
      staffOrigin,
      recoveryOrigin: recoveryDelivery?.origin ?? recoveryDeliveryOrigin,
      host: config.launcherHost,
      port: config.launcherPort,
      roleLinkMode: "direct-sign-in",
    });
  };

  try {
    seedResult = await loadOrCreateSeedResult(paths.seedResultFile, runSeed);
    await startApiAndWorker();
    recoveryDelivery = await startDemoRecoveryDelivery({
      host: "127.0.0.1",
      port: 4171,
      authorizationSecret: secrets.recoveryDeliverySecret,
      staffOrigin,
    });
    for (const spec of previewSpecs(repositoryRoot, environment, secretList)) {
      previewProcesses.push(startManagedDemoProcess(spec));
    }
    await waitForHttp(`${customerOrigin}/`);
    await waitForHttp(`${staffOrigin}/`);
    await waitForHttp(`${adminOrigin}/`);
    launcher = await startDemoLauncher({
      result: seedResult,
      apiOrigin,
      adminOrigin,
      staffOrigin,
      recoveryOrigin: recoveryDelivery.origin,
      host: config.launcherHost,
      port: config.launcherPort,
      roleLinkMode: "direct-sign-in",
    });
    await waitForHttp(`${launcher.origin}/health/live`);
    controlServer = await new Promise<Server>((resolve, reject) => {
      const server = createServer((request, response) => {
        if (
          request.headers.authorization !== `Bearer ${secrets.controlSecret}`
        ) {
          response.statusCode = 404;
          response.end();
          return;
        }
        if (request.url !== "/reset" || request.method !== "POST") {
          response.statusCode = 404;
          response.end();
          return;
        }
        void performReset()
          .then(() => {
            response.statusCode = 204;
            response.end();
          })
          .catch((error: unknown) => {
            response.statusCode = 500;
            response.end(
              error instanceof Error ? error.message : "Reset failed.",
            );
          });
      });
      server.once("error", reject);
      server.listen(DESKTOP_CONTROL_PORT, "127.0.0.1", () => resolve(server));
    });
    process.stdout.write(
      `${encodeReadyLine({ launcherOrigin: launcher.origin })}\n`,
    );
    await new Promise<void>((resolve) => {
      const stop = (): void => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } finally {
    await new Promise<void>((resolve) => {
      if (!controlServer) {
        resolve();
        return;
      }
      controlServer.close(() => resolve());
    });
    await launcher?.close().catch(() => undefined);
    await recoveryDelivery?.close().catch(() => undefined);
    for (const child of [...previewProcesses].reverse()) {
      await child.terminate();
    }
    await stopApiAndWorker();
    await postgres.close();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown desktop demo failure.";
  process.stderr.write(`Desktop demo environment failed: ${message}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Typecheck**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec tsc --noEmit -p tsconfig.check.json
```

Expected: no errors. (This is the primary correctness gate for this file — see the note above about why it has no unit test.)

- [ ] **Step 3: Manually verify the orchestrator runs end-to-end**

This worktree already has PostgreSQL 18 installed locally (confirmed at plan-writing time), so `findPostgresBinary`'s existing fallback path lets this run without any vendored binaries.

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
Set-Location "C:\Users\HP\Desktop\mvp-desktop-app"
corepack pnpm build
$env:MISE_DESKTOP_APP_DATA_DIR = Join-Path $env:TEMP "mise-desktop-orchestrator-smoke"
$env:MISE_DESKTOP_REPOSITORY_ROOT = (Get-Location).Path
node --import tsx scripts/desktop-orchestrator.ts
```

Expected: the process prints progress from each spawned child (prefixed `[demo:api]`, `[demo:worker]`, `[demo:customer]`, `[demo:staff]`, `[demo:admin]`, exactly like `dev-demo.ts` today), and finally a line starting with `MISE_DESKTOP_READY {"launcherOrigin":"http://127.0.0.1:4170"}`. In a second PowerShell tab (repeat the `fnm` activation line first), confirm:

```powershell
(Invoke-WebRequest "http://127.0.0.1:4170/").StatusCode
(Invoke-WebRequest "http://127.0.0.1:5175/auth/sign-in").StatusCode
```

both return `200`. Then in the running terminal press `Ctrl+C` and confirm the process exits cleanly (no hung child processes — check with `Get-Process node -ErrorAction SilentlyContinue`, expect none left over after a few seconds).

Run it a **second** time with the same `MISE_DESKTOP_APP_DATA_DIR` and confirm in its output that no `Seeded dar-nedjma-demo:` line appears this time (that message comes from `seedDemo`, only reached on first run via `loadOrCreateSeedResult`'s `createSeedResult` callback) — this is the concrete evidence that the "seed only once, persist afterward" requirement actually holds against a real database, not just in the Task 6 unit test. Clean up afterward:

```powershell
Remove-Item -Recurse -Force $env:MISE_DESKTOP_APP_DATA_DIR
```

- [ ] **Step 4: Commit**

```bash
git add scripts/desktop-orchestrator.ts
git commit -m "feat(desktop): add the desktop-orchestrator entrypoint"
```

---

## Task 13: `main.ts` — the Electron shell

**Files:**
- Modify: `apps/desktop/src/main.ts` (replaces the Task 1 placeholder)

**Interfaces:**
- Consumes: `DESKTOP_CONTROL_PORT` from `./shared/desktop-config.js`; `ensureDesktopDirectories`, `resolveDesktopPaths` from `./shared/desktop-paths.js`; `loadOrCreateDesktopSecrets` from `./shared/desktop-secrets.js`; `parseReadyLine` from `./shared/orchestrator-protocol.js`; `performDemoDataReset` from `./reset-demo-data.js`; `buildTrayMenuTemplate` from `./tray-menu.js`; `WindowRegistry`, `type RoleWindowHandle` from `./window-registry.js`.
- No dedicated unit test — this file is Electron application glue (window lifecycle, process spawning) that composes the already-unit-tested pure modules from Tasks 2–11. Verified manually in Step 2 and again end-to-end in Task 15.

- [ ] **Step 1: Write the implementation**

Replace the contents of `apps/desktop/src/main.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { DESKTOP_CONTROL_PORT } from "./shared/desktop-config.js";
import {
  ensureDesktopDirectories,
  resolveDesktopPaths,
} from "./shared/desktop-paths.js";
import { loadOrCreateDesktopSecrets } from "./shared/desktop-secrets.js";
import { parseReadyLine } from "./shared/orchestrator-protocol.js";
import { performDemoDataReset } from "./reset-demo-data.js";
import { buildTrayMenuTemplate } from "./tray-menu.js";
import { WindowRegistry, type RoleWindowHandle } from "./window-registry.js";

// A minimal 1x1 PNG, used as a functional placeholder tray icon so packaging
// does not depend on a binary asset file. Swap for a real icon later.
const trayIconDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const repositoryRoot = app.isPackaged
  ? join(process.resourcesPath, "app-bundle")
  : join(app.getAppPath(), "..", "..");
const orchestratorEntry = join(repositoryRoot, "scripts", "desktop-orchestrator.ts");

let homeWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let orchestratorChild: ChildProcess | undefined;
let launcherOrigin: string | undefined;
let controlSecret = "";
const windowRegistry = new WindowRegistry();
let nextWindowId = 1;

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildTrayMenuTemplate(windowRegistry.list(), {
        openHome: openHomeWindow,
        resetDemoData: () => {
          handleResetDemoData().catch((error: unknown) => {
            process.stderr.write(
              `Reset demo data failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
            );
          });
        },
        quit: () => app.quit(),
      }),
    ),
  );
}

function openHomeWindow(): void {
  if (!launcherOrigin) {
    return;
  }
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.loadURL(launcherOrigin).catch(() => undefined);
    homeWindow.focus();
    return;
  }
  const window = new BrowserWindow({ width: 1180, height: 820, title: "MISE Desktop" });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    openRoleWindow(url);
    return { action: "deny" };
  });
  window.on("closed", () => {
    if (homeWindow === window) {
      homeWindow = undefined;
    }
  });
  homeWindow = window;
  window.loadURL(launcherOrigin).catch(() => undefined);
}

function openRoleWindow(url: string): void {
  const id = nextWindowId;
  nextWindowId += 1;
  const roleWindow = new BrowserWindow({ width: 1180, height: 820, title: url });
  roleWindow.setMenuBarVisibility(false);
  const handle: RoleWindowHandle = {
    id,
    roleKey: url,
    label: url,
    close: () => roleWindow.close(),
    focus: () => roleWindow.focus(),
  };
  windowRegistry.register(handle);
  roleWindow.on("closed", () => {
    windowRegistry.unregister(id);
    refreshTrayMenu();
  });
  roleWindow.loadURL(url).catch(() => undefined);
  refreshTrayMenu();
}

async function handleResetDemoData(): Promise<void> {
  await performDemoDataReset({
    closeRoleWindows: () => windowRegistry.closeAll(),
    requestReset: async () => {
      const response = await fetch(
        `http://127.0.0.1:${String(DESKTOP_CONTROL_PORT)}/reset`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${controlSecret}` },
        },
      );
      if (!response.ok) {
        throw new Error(`Reset demo data failed with status ${String(response.status)}.`);
      }
    },
    reopenHomeWindow: () => {
      homeWindow?.close();
      homeWindow = undefined;
      openHomeWindow();
    },
  });
  refreshTrayMenu();
}

async function startOrchestrator(): Promise<void> {
  const paths = resolveDesktopPaths(app.getPath("appData"));
  await ensureDesktopDirectories(paths);
  const secrets = await loadOrCreateDesktopSecrets(paths.secretsFile);
  controlSecret = secrets.controlSecret;
  const log = createWriteStream(paths.logFile, { flags: "a" });
  const child = spawn(process.execPath, ["--import", "tsx", orchestratorEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      // Electron's own binary is process.execPath; this flag makes it run
      // as plain Node instead of launching another GUI process. Descendant
      // processes (api/worker/vite preview) inherit it because
      // scripts/desktop-orchestrator.ts's runtimeEnvironment() spreads
      // ...process.env into their env too.
      ELECTRON_RUN_AS_NODE: "1",
      MISE_DESKTOP_APP_DATA_DIR: app.getPath("appData"),
      MISE_DESKTOP_REPOSITORY_ROOT: repositoryRoot,
    },
    windowsHide: true,
  });
  orchestratorChild = child;
  let partial = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      const ready = parseReadyLine(line);
      if (ready) {
        launcherOrigin = ready.launcherOrigin;
        openHomeWindow();
      }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
}

app.whenReady().then(() => {
  tray = new Tray(nativeImage.createFromDataURL(trayIconDataUrl));
  tray.setToolTip("MISE Desktop");
  refreshTrayMenu();
  startOrchestrator().catch((error: unknown) => {
    process.stderr.write(
      `Failed to start the desktop orchestrator: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  });
}).catch(() => undefined);

app.on("window-all-closed", () => {
  // Intentionally do not quit: the orchestrator (and the demo it runs) keep
  // running via the tray, so a tester can reopen the home window later.
});

app.on("before-quit", () => {
  orchestratorChild?.kill();
});
```

- [ ] **Step 2: Build and manually verify the Electron shell launches**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
Set-Location "C:\Users\HP\Desktop\mvp-desktop-app"
corepack pnpm build
corepack pnpm --filter @rms/desktop build
corepack pnpm --filter @rms/desktop start
```

Expected: an Electron window titled "MISE Desktop" opens automatically once the orchestrator becomes ready (this can take up to ~30 seconds — the same startup cost `dev:demo` has). A tray icon appears in the Windows system tray; right-clicking it shows "Open home window", "No role windows open", "Reset demo data", and "Quit". Clicking a role's "Open administration"/"Open staff" button in the Home window opens a **new** Electron window at that app's real `/auth/sign-in` screen (confirm the URL bar/title reflects `http://127.0.0.1:5175/auth/sign-in` or `:5173/auth/sign-in`, not an already-signed-in page). Close the app via the tray's "Quit" item and confirm no orphaned `node.exe` processes remain (`Get-Process node -ErrorAction SilentlyContinue`).

If this is the first run against a fresh `%APPDATA%\MISE Desktop`, delete it before retrying:

```powershell
Remove-Item -Recurse -Force (Join-Path $env:APPDATA "MISE Desktop") -ErrorAction SilentlyContinue
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main.ts
git commit -m "feat(desktop): add the Electron main process shell"
```

---

## Task 14: Packaging config, vendored PostgreSQL docs, and the package README

**Files:**
- Create: `apps/desktop/electron-builder.config.cjs`
- Create: `apps/desktop/electron-builder.config.test.ts`
- Create: `apps/desktop/vendor/postgresql/README.md`
- Create: `apps/desktop/README.md`

**Interfaces:**
- Produces: the `electron-builder.config.cjs` object consumed by the `dist:win`/`dist:portable` scripts added in Task 1.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron-builder.config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import config from "./electron-builder.config.cjs";

describe("electron-builder.config.cjs", () => {
  it("names the app MISE Desktop with a stable app id", () => {
    expect(config.productName).toBe("MISE Desktop");
    expect(config.appId).toBe("com.mise.desktop");
  });

  it("outputs packaged artifacts to release/, not dist/ (which holds compiled source)", () => {
    expect(config.directories.output).toBe("release");
  });

  it("targets both an NSIS installer and a portable exe on Windows", () => {
    expect(config.win.target).toEqual(
      expect.arrayContaining(["nsis", "portable"]),
    );
  });

  it("bundles the vendored PostgreSQL binaries as extraResources", () => {
    const postgresResource = config.extraResources.find(
      (resource: { to: string }) => resource.to === "postgresql",
    );
    expect(postgresResource).toBeDefined();
    expect(postgresResource.from).toBe("vendor/postgresql");
  });

  it("bundles the built api, worker, web apps, scripts, and node_modules under app-bundle", () => {
    const destinations = config.extraResources.map(
      (resource: { to: string }) => resource.to,
    );
    expect(destinations).toEqual(
      expect.arrayContaining([
        "app-bundle/scripts",
        "app-bundle/apps/api/dist",
        "app-bundle/apps/worker/dist",
        "app-bundle/apps/web/customer/dist",
        "app-bundle/apps/web/staff/dist",
        "app-bundle/apps/web/admin/dist",
        "app-bundle/node_modules",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/electron-builder.config.test.ts
```

Expected: FAIL — `./electron-builder.config.cjs` does not exist.

- [ ] **Step 3: Write the packaging config**

Create `apps/desktop/electron-builder.config.cjs`:

```js
module.exports = {
  appId: "com.mise.desktop",
  productName: "MISE Desktop",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    { from: "vendor/postgresql", to: "postgresql" },
    {
      from: "../../scripts",
      to: "app-bundle/scripts",
      filter: ["**/*.ts", "!**/*.test.ts"],
    },
    {
      from: "../../packages",
      to: "app-bundle/packages",
      filter: ["*/dist/**/*", "*/package.json"],
    },
    { from: "../../apps/api/dist", to: "app-bundle/apps/api/dist" },
    { from: "../../apps/api/package.json", to: "app-bundle/apps/api/package.json" },
    { from: "../../apps/worker/dist", to: "app-bundle/apps/worker/dist" },
    {
      from: "../../apps/worker/package.json",
      to: "app-bundle/apps/worker/package.json",
    },
    { from: "../../apps/web/customer/dist", to: "app-bundle/apps/web/customer/dist" },
    {
      from: "../../apps/web/customer/node_modules/vite",
      to: "app-bundle/apps/web/customer/node_modules/vite",
    },
    { from: "../../apps/web/staff/dist", to: "app-bundle/apps/web/staff/dist" },
    {
      from: "../../apps/web/staff/node_modules/vite",
      to: "app-bundle/apps/web/staff/node_modules/vite",
    },
    { from: "../../apps/web/admin/dist", to: "app-bundle/apps/web/admin/dist" },
    {
      from: "../../apps/web/admin/node_modules/vite",
      to: "app-bundle/apps/web/admin/node_modules/vite",
    },
    { from: "../../node_modules", to: "app-bundle/node_modules" },
    { from: "../../package.json", to: "app-bundle/package.json" },
  ],
  win: {
    target: ["nsis", "portable"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm exec vitest run apps/desktop/electron-builder.config.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Document the vendored PostgreSQL step**

Create `apps/desktop/vendor/postgresql/README.md`:

```markdown
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
```

- [ ] **Step 6: Write the package README**

Create `apps/desktop/README.md`:

```markdown
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
```

- [ ] **Step 7: Attempt a real Windows build**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
Set-Location "C:\Users\HP\Desktop\mvp-desktop-app"
corepack pnpm build
corepack pnpm --filter @rms/desktop build
corepack pnpm --filter @rms/desktop dist:portable
```

Expected: this requires network access for `electron-builder` to download its NSIS/portable-target helper tools on first use, and requires `apps/desktop/vendor/postgresql/bin/` to actually contain PostgreSQL binaries (per Step 5's README) for the *packaged* app to be fully functional — but the build itself (producing a `.exe` under `apps/desktop/release/`) should succeed even without vendoring, since nothing at build time reads the vendor folder's contents (only `extraResources`' `from` path needs to exist — create an empty `vendor/postgresql/bin/` directory if needed so the copy step doesn't fail on a missing path). If this fails in this environment (no network access, missing build tools), report the exact error rather than claiming success — packaging is still verified structurally by Step 4's test and functionally by Tasks 12–13's dev-mode runs, so a failure here does not block the rest of the plan, but it must be reported honestly.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron-builder.config.cjs apps/desktop/electron-builder.config.test.ts apps/desktop/vendor/postgresql/README.md apps/desktop/README.md
git commit -m "feat(desktop): add electron-builder packaging config and docs"
```

---

## Task 15: End-to-end manual verification

**Files:** none (verification only, per the spec's "Testing" section: "Manual, on a clean Windows VM or a machine without PostgreSQL installed... this is the test that actually matters here, more than automated coverage").

**Interfaces:** none — this task exercises the whole system built in Tasks 1–14.

- [ ] **Step 1: Full clean run**

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
Set-Location "C:\Users\HP\Desktop\mvp-desktop-app"
Remove-Item -Recurse -Force (Join-Path $env:APPDATA "MISE Desktop") -ErrorAction SilentlyContinue
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --filter @rms/desktop build
corepack pnpm --filter @rms/desktop start
```

- [ ] **Step 2: Confirm the Home window**

The Home window opens automatically. It shows the restaurant name ("Dar Nedjma"), branch ("Hydra"), business code (`dar-nedjma-demo`), four role cards (Owner/administrator, General staff, Kitchen staff, Cashier) each with an email and an "Open administration"/"Open staff" button, a reveal/copy password control, and a customer table link.

- [ ] **Step 3: Walk the golden journey across separate windows**

- Click the customer table link: a new window opens at the guest ordering menu. Submit an order.
- Click "Open staff" for General staff: a new window opens at `http://127.0.0.1:5173/auth/sign-in`. Reveal the password on the Home window, sign in manually (not auto-logged in), and confirm the order/table handoff is visible.
- Click "Open staff" for Kitchen: sign in manually in its own window, start and ready the submitted order.
- Back in the General staff window, mark the order served.
- Click "Open staff" for Cashier: sign in manually in its own window, record the payment and complete the order.
- Click "Open administration" for Owner: sign in manually in its own window, confirm the completed order is visible in reporting/insights.

Confirm every one of these is a genuinely separate native window (not a browser tab), and that none of them were logged in automatically — each required entering the real credentials from the Home window into that app's real sign-in form.

- [ ] **Step 4: Exercise "Reset demo data"**

Right-click the tray icon, click "Reset demo data". Confirm every open role/guest window closes, the Home window reopens (or reloads), and the data shown afterward matches a fresh seed (the order placed in Step 3 is gone; a new open order and a new settled/paid order from the seed script are present again).

- [ ] **Step 5: Confirm persistence across a full restart**

Quit the app via the tray (not just closing windows). Relaunch it (`corepack pnpm --filter @rms/desktop start` again, or the packaged installer if Task 14's build succeeded). Confirm startup is faster than the very first run (no reseed message in the log file at `%APPDATA%\MISE Desktop\logs\desktop.log`) and that the data from Step 4's reset (not the original Step 3 data) is still present — this is the "data persists in the app's own folder across restarts" requirement from the spec.

- [ ] **Step 6: Record the result**

If every step above passes, the feature is complete per the spec's Testing section. If the Task 14 Step 7 packaged-installer build succeeded on this machine, repeat Steps 1–5 once against the installed app (not `pnpm start`) as the more realistic "customer" scenario the spec calls out; if it did not succeed (e.g. no network access for `electron-builder`'s helper-tool download in this environment), note that explicitly rather than skipping it silently — it is a known gap, not a passed check.

No commit for this task (verification only). If any step surfaces a bug, fix it in the relevant task's files, re-run that task's own verification, then resume from Step 1 here.
