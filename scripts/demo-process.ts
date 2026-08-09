import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

export interface DemoProcessSpec {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly secrets: readonly string[];
}

export interface ManagedDemoProcess {
  readonly label: string;
  readonly pid: number;
  waitForText(text: string, timeoutMilliseconds?: number): Promise<void>;
  terminate(): Promise<void>;
}

interface TextWaiter {
  readonly text: string;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

function redactLine(line: string, secrets: readonly string[]): string {
  let redacted = line.replace(
    /\/api\/v1\/public\/qr\/[^\s/]+\/session/g,
    "/api/v1/public/qr/[REDACTED]/session",
  );
  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }
  return redacted;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForExit(
  child: ChildProcess,
  timeoutMilliseconds: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    delay(timeoutMilliseconds),
  ]);
}

export function startManagedDemoProcess(
  spec: DemoProcessSpec,
): ManagedDemoProcess {
  const child = spawn(spec.command, [...spec.args], {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  const pid = child.pid;
  if (!pid) {
    throw new Error(`Could not start the ${spec.label} process.`);
  }
  const waiters: TextWaiter[] = [];
  const seen = new Set<string>();
  let partial = "";
  let exited = false;
  let exitError: Error | undefined;

  const consume = (chunk: Buffer): void => {
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      for (const waiter of [...waiters]) {
        if (line.includes(waiter.text)) {
          seen.add(waiter.text);
          clearTimeout(waiter.timer);
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
      }
      process.stdout.write(
        `[demo:${spec.label}] ${redactLine(line, spec.secrets)}\n`,
      );
    }
  };

  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  child.once("error", (error) => {
    exitError = error;
    exited = true;
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(`${spec.label} failed to start: ${error.message}`),
      );
    }
    waiters.length = 0;
  });
  child.once("exit", (code, signal) => {
    exited = true;
    if (code !== 0 && signal === null) {
      exitError = new Error(
        `${spec.label} exited with code ${code ?? "unknown"}.`,
      );
    }
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timer);
      waiter.reject(
        exitError ?? new Error(`${spec.label} exited before it became ready.`),
      );
    }
    waiters.length = 0;
  });

  return {
    label: spec.label,
    pid,
    waitForText(text, timeoutMilliseconds = 30_000): Promise<void> {
      if (seen.has(text)) {
        return Promise.resolve();
      }
      if (exited) {
        return Promise.reject(
          exitError ??
            new Error(`${spec.label} exited before it became ready.`),
        );
      }
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.splice(
            waiters.findIndex((waiter) => waiter.text === text),
            1,
          );
          reject(
            new Error(
              `${spec.label} did not report readiness within ${timeoutMilliseconds}ms.`,
            ),
          );
        }, timeoutMilliseconds);
        waiters.push({ text, resolve, reject, timer });
      });
    },
    async terminate(): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      if (process.platform === "win32") {
        await executeFile("taskkill.exe", [
          "/PID",
          String(pid),
          "/T",
          "/F",
        ]).catch(() => undefined);
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
      await waitForExit(child, 5_000);
      if (!exited) {
        if (process.platform === "win32") {
          await executeFile("taskkill.exe", [
            "/PID",
            String(pid),
            "/T",
            "/F",
          ]).catch(() => undefined);
        } else {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      }
    },
  };
}

export async function waitForHttp(
  url: string,
  expectedStatus = 200,
  timeoutMilliseconds = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError = "connection unavailable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === expectedStatus) {
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : "request failed";
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url} (${lastError}).`);
}

export async function waitForDatabase(
  connectionString: string,
  timeoutMilliseconds = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError = "database unavailable";
  while (Date.now() < deadline) {
    try {
      const { createDatabasePool } = await import("@rms/building-blocks");
      const pool = createDatabasePool({
        connectionString,
        applicationName: "rms-demo-supervisor",
        maximumConnections: 1,
      });
      await pool.query("select 1");
      await pool.end();
      return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : "connection failed";
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for PostgreSQL (${lastError}).`);
}
