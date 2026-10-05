import { fork, type ChildProcess } from "node:child_process";
import { isMessage, type HostMessage } from "./child-ipc.js";

export interface ServiceProcess {
  readonly label: string;
  readonly exited: Promise<number | null>;
  stop(): Promise<void>;
}

export interface ServiceProcessOptions {
  readonly label: string;
  readonly entry: string;
  readonly env: NodeJS.ProcessEnv;
  readonly log: (line: string) => void;
  readonly readyTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
}

/**
 * Forks one service (API or worker) with the same Node binary that runs the
 * host, resolves once it reports ready over IPC, and stops it gracefully over
 * IPC — signals are not delivered on Windows, so they cannot be relied on.
 */
export async function startServiceProcess(
  options: ServiceProcessOptions,
): Promise<ServiceProcess> {
  const child: ChildProcess = fork(options.entry, [], {
    env: options.env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let tail = "";
  const forward = (chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    tail = (tail + text).slice(-2_000);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) {
        options.log(`[${options.label}] ${line}`);
      }
    }
  };
  child.stdout?.on("data", forward);
  child.stderr?.on("data", forward);

  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(`The ${options.label} did not start within the time limit.`),
      );
    }, options.readyTimeoutMs ?? 60_000);
    child.on("message", (message: unknown) => {
      if (isMessage(message, "ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    void exited.then((code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `The ${options.label} stopped during startup (exit code ${String(code)}). ${lastMeaningfulLine(tail)}`.trim(),
        ),
      );
    });
  });

  let stopping: Promise<void> | undefined;
  return {
    label: options.label,
    exited,
    stop(): Promise<void> {
      stopping ??= (async () => {
        if (child.exitCode !== null || child.signalCode !== null) {
          return;
        }
        if (child.connected) {
          child.send({ type: "shutdown" } satisfies HostMessage);
        }
        const timeout = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), options.stopTimeoutMs ?? 10_000),
        );
        if ((await Promise.race([exited, timeout])) === "timeout") {
          child.kill();
          await exited;
        }
      })();
      return stopping;
    },
  };
}

function lastMeaningfulLine(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines.at(-1);
  if (!last) {
    return "";
  }
  try {
    const parsed = JSON.parse(last) as { msg?: unknown };
    return typeof parsed.msg === "string" ? parsed.msg : "";
  } catch {
    return last.slice(0, 300);
  }
}
