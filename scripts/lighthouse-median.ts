import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse, { desktopConfig } from "lighthouse";
import type { Config, Flags, RunnerResult } from "lighthouse";
import { findFreeLoopbackPort } from "./demo-postgres.js";
import {
  startManagedDemoProcess,
  waitForHttp,
  type ManagedDemoProcess,
} from "./demo-process.js";

const repositoryRoot = process.cwd();
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const runsPerTarget = 3;

function runCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

/**
 * chrome-launcher only ever deletes a Chrome profile directory it created
 * itself: destroyTmp() no-ops whenever `userDataDir` was supplied by the
 * caller (see chrome-launcher's chrome-launcher.js). Passing our own
 * run-scoped directory below means chrome-launcher never touches it, which
 * is what avoids the Windows EPERM crash previously seen when Lighthouse
 * relied on chrome-launcher's own auto-managed temp profile cleanup racing
 * Chrome's file-handle release. Deletion of that directory is instead done
 * once at the end of a full run, with a tolerant retry.
 */
async function removeWithRetry(path: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 3) return;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

interface PreviewApp {
  readonly label: string;
  readonly appDir: string;
}

const previewApps: readonly PreviewApp[] = [
  { label: "customer", appDir: join("apps", "web", "customer") },
  { label: "staff", appDir: join("apps", "web", "staff") },
  { label: "admin", appDir: join("apps", "web", "admin") },
];

interface VitePackageJson {
  readonly bin: string | Record<string, string>;
}

/**
 * vite's package.json `exports` map does not expose `./bin/vite.js` as an
 * importable subpath (only `.`, `./client`, and a handful of others), so
 * `require.resolve("vite/bin/vite.js")` fails with ERR_PACKAGE_PATH_NOT_EXPORTED
 * even though the file exists on disk. Its `package.json` itself is
 * exported, so resolve that instead and read the real entry point from its
 * `bin` field, exactly as npm/pnpm's own `.bin/vite` shim does.
 */
function resolveViteBin(appDirectory: string): string {
  const scopedRequire = createRequire(join(appDirectory, "package.json"));
  const packageJsonPath = scopedRequire.resolve("vite/package.json");
  const packageJson = scopedRequire(packageJsonPath) as VitePackageJson;
  const relativeBin =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin.vite;
  if (!relativeBin) {
    throw new Error("Could not resolve vite's bin entry point.");
  }
  return join(packageJsonPath, "..", relativeBin);
}

type FormFactor = "mobile" | "desktop";

interface CategoryScores {
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}

async function buildWorkspace(): Promise<void> {
  const status = await runCommand(
    corepack,
    ["pnpm", "-r", "--workspace-concurrency=1", "--if-present", "build"],
    process.env,
  );
  if (status !== 0) {
    throw new Error(`Workspace build failed with status ${String(status)}.`);
  }
}

async function startPreview(
  app: PreviewApp,
): Promise<{ readonly origin: string; readonly process: ManagedDemoProcess }> {
  const port = await findFreeLoopbackPort();
  const appDirectory = join(repositoryRoot, app.appDir);
  const managed = startManagedDemoProcess({
    label: `lighthouse-${app.label}`,
    command: process.execPath,
    args: [
      resolveViteBin(appDirectory),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    cwd: appDirectory,
    env: process.env,
    secrets: [],
  });
  const origin = `http://127.0.0.1:${String(port)}`;
  await waitForHttp(`${origin}/`, 200, 30_000);
  return { origin, process: managed };
}

async function runOnce(
  url: string,
  formFactor: FormFactor,
  profileDirectory: string,
): Promise<CategoryScores | undefined> {
  await mkdir(profileDirectory, { recursive: true });
  // chrome-launcher's own bundled getRandomPort() helper (used whenever no
  // `port` is supplied) calls server.listen(0) before it attaches its
  // `error` listener, so a transient ENOBUFS there throws uncaught and
  // crashes this whole process rather than rejecting a promise we could
  // catch. Pre-allocating the port ourselves (our own findFreeLoopbackPort
  // attaches its error listener first) skips that code path entirely.
  const debuggingPort = await findFreeLoopbackPort();
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu"],
    userDataDir: profileDirectory,
    port: debuggingPort,
  });
  try {
    const flags: Flags = {
      port: chrome.port,
      output: "json",
      logLevel: "error",
    };
    const config: Config | undefined =
      formFactor === "desktop" ? desktopConfig : undefined;
    const result: RunnerResult | undefined = await lighthouse(
      url,
      flags,
      config,
    );
    if (!result) return undefined;
    const categories = result.lhr.categories;
    return {
      performance: categories.performance?.score ?? 0,
      accessibility: categories.accessibility?.score ?? 0,
      bestPractices: categories["best-practices"]?.score ?? 0,
      seo: categories.seo?.score ?? 0,
    };
  } finally {
    try {
      chrome.kill();
    } catch {
      // Housekeeping only; the result above is already captured.
    }
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

interface TargetMedian {
  readonly app: string;
  readonly formFactor: FormFactor;
  readonly runs: number;
  readonly failures: number;
  readonly medianScores: CategoryScores;
}

function renderMarkdown(
  runId: string,
  results: readonly TargetMedian[],
): string {
  const scoreOf100 = (value: number) => Math.round(value * 100);
  const rows = results
    .map(
      (result) =>
        `| ${result.app} | ${result.formFactor} | ${String(result.runs)}/${String(result.runs + result.failures)} | ${String(scoreOf100(result.medianScores.performance))} | ${String(scoreOf100(result.medianScores.accessibility))} | ${String(scoreOf100(result.medianScores.bestPractices))} | ${String(scoreOf100(result.medianScores.seo))} |`,
    )
    .join("\n");
  return `# Lighthouse median report

Run: ${runId}
Each row is the median of ${String(runsPerTarget)} runs against a production preview build's root route.

| App | Form factor | Successful runs | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|---|
${rows}
`;
}

async function main(): Promise<void> {
  if (process.env.LIGHTHOUSE_SKIP_BUILD !== "true") {
    await buildWorkspace();
  }
  const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const outputDirectory = join(repositoryRoot, "output", "lighthouse", runId);
  const profilesDirectory = join(outputDirectory, "profiles");

  const results: TargetMedian[] = [];
  for (const app of previewApps) {
    const preview = await startPreview(app);
    try {
      for (const formFactor of ["mobile", "desktop"] as const) {
        const samples: CategoryScores[] = [];
        let failures = 0;
        for (let run = 1; run <= runsPerTarget; run += 1) {
          const profileDirectory = join(
            profilesDirectory,
            `${app.label}-${formFactor}-${String(run)}`,
          );
          console.log(
            `Lighthouse ${app.label} (${formFactor}) run ${String(run)}/${String(runsPerTarget)}...`,
          );
          const scores = await runOnce(
            `${preview.origin}/`,
            formFactor,
            profileDirectory,
          );
          if (scores) {
            samples.push(scores);
          } else {
            failures += 1;
          }
        }
        results.push({
          app: app.label,
          formFactor,
          runs: samples.length,
          failures,
          medianScores: {
            performance: median(samples.map((s) => s.performance)),
            accessibility: median(samples.map((s) => s.accessibility)),
            bestPractices: median(samples.map((s) => s.bestPractices)),
            seo: median(samples.map((s) => s.seo)),
          },
        });
      }
    } finally {
      await preview.process.terminate();
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "report.json"),
    JSON.stringify({ runId, results }, null, 2),
    "utf8",
  );
  await writeFile(
    join(outputDirectory, "report.md"),
    renderMarkdown(runId, results),
    "utf8",
  );
  console.log(`Lighthouse median report written to ${outputDirectory}`);
  console.log(JSON.stringify(results, null, 2));

  await removeWithRetry(profilesDirectory);
}

await main();
