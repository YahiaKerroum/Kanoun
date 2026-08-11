import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { startRealE2eHarness } from "./real-e2e-harness.js";

const repositoryRoot = process.cwd();
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

function loadLocalEnvironment(): void {
  const environmentFile = join(repositoryRoot, ".env");
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
}

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

async function main(): Promise<void> {
  loadLocalEnvironment();
  if (process.env.REAL_E2E_SKIP_BUILD !== "true") {
    const buildStatus = await runCommand(
      corepack,
      ["pnpm", "-r", "--workspace-concurrency=1", "--if-present", "build"],
      process.env,
    );
    if (buildStatus !== 0) {
      throw new Error(`Real E2E build failed with status ${buildStatus}.`);
    }
  }
  const harness = await startRealE2eHarness(process.env);
  const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
  const runnerNodeOptions = existingNodeOptions?.includes(
    "--max-old-space-size",
  )
    ? existingNodeOptions
    : `${existingNodeOptions ?? ""} --max-old-space-size=2048`.trim();
  const status = await runCommand(
    corepack,
    [
      "pnpm",
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.real-stack.config.ts",
    ],
    { ...harness.environment, NODE_OPTIONS: runnerNodeOptions },
  ).finally(() => harness.close());
  if (status === 0) {
    await rm(join(repositoryRoot, "output", "playwright", "real"), {
      recursive: true,
      force: true,
    });
    return;
  }
  throw new Error(
    `Real-stack Playwright verification failed with status ${status}.`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Real E2E failed."}\n`,
  );
  process.exitCode = 1;
});
