import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import pg from "pg";

export const LOCAL_DATABASE_NAME = "mise";
export const LOCAL_DATABASE_USER = "mise";

export class LocalPostgresError extends Error {
  public readonly name = "LocalPostgresError";
}

function executable(binary: string): string {
  return process.platform === "win32" ? `${binary}.exe` : binary;
}

/**
 * Finds the PostgreSQL binaries: the copy bundled with the app first, then a
 * standard PostgreSQL 18 install (useful while developing the desktop app).
 */
export function findPostgresBinDirectory(
  bundledRoot: string,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const candidates = [join(bundledRoot, "postgresql", "bin")];
  if (process.platform === "win32") {
    for (const root of [process.env.ProgramW6432, process.env.ProgramFiles]) {
      if (root) {
        candidates.push(join(root, "PostgreSQL", "18", "bin"));
      }
    }
  } else {
    candidates.push(
      "/usr/lib/postgresql/18/bin",
      "/opt/homebrew/opt/postgresql@18/bin",
    );
  }
  return candidates.find((directory) =>
    exists(join(directory, executable("pg_ctl"))),
  );
}

function run(
  command: string,
  args: readonly string[],
  log: (line: string) => void,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      windowsHide: true,
      // pg_ctl leaves the postmaster running after it exits; it must not
      // inherit pipes that would keep this promise from settling.
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      output += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          log(`[postgres] ${line}`);
        }
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

export interface LocalPostgresOptions {
  readonly binDirectory: string;
  readonly clusterDirectory: string;
  readonly port: number;
  readonly password: string;
  readonly log: (line: string) => void;
}

export interface LocalPostgres {
  readonly databaseUrl: string;
  readonly adminUrl: string;
  stop(): Promise<void>;
}

function localUrl(options: LocalPostgresOptions, database: string): string {
  const url = new URL("postgresql://127.0.0.1");
  url.port = String(options.port);
  url.username = LOCAL_DATABASE_USER;
  url.password = options.password;
  url.pathname = `/${database}`;
  return url.toString();
}

async function ensureDatabase(adminUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const existing = await client.query(
      "select 1 from pg_database where datname = $1",
      [LOCAL_DATABASE_NAME],
    );
    if (existing.rowCount === 0) {
      await client.query(`create database ${LOCAL_DATABASE_NAME}`);
    }
  } finally {
    await client.end();
  }
}

/** Drops and recreates the application database inside the local cluster. */
export async function recreateLocalDatabase(adminUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `drop database if exists ${LOCAL_DATABASE_NAME} with (force)`,
    );
    await client.query(`create database ${LOCAL_DATABASE_NAME}`);
  } finally {
    await client.end();
  }
}

async function initializeCluster(options: LocalPostgresOptions): Promise<void> {
  const passwordFile = join(options.clusterDirectory, "..", ".initdb-password");
  await writeFile(passwordFile, `${options.password}\n`, { mode: 0o600 });
  try {
    const result = await run(
      join(options.binDirectory, executable("initdb")),
      [
        "-D",
        options.clusterDirectory,
        `--username=${LOCAL_DATABASE_USER}`,
        `--pwfile=${passwordFile}`,
        "--auth=scram-sha-256",
        "--encoding=UTF8",
        "--no-locale",
      ],
      options.log,
    );
    if (result.code !== 0) {
      await rm(options.clusterDirectory, { recursive: true, force: true });
      throw new LocalPostgresError(
        "The local database could not be created. See the runtime log for details.",
      );
    }
  } finally {
    await rm(passwordFile, { force: true });
  }
}

async function isRunning(options: LocalPostgresOptions): Promise<boolean> {
  const result = await run(
    join(options.binDirectory, executable("pg_ctl")),
    ["-D", options.clusterDirectory, "status"],
    () => undefined,
  );
  return result.code === 0;
}

/**
 * Starts (initializing on first use) the cluster that keeps this computer's
 * restaurant data. A cluster left running by a crashed previous session is
 * reused rather than treated as an error.
 */
export async function startLocalPostgres(
  options: LocalPostgresOptions,
): Promise<LocalPostgres> {
  const pgCtl = join(options.binDirectory, executable("pg_ctl"));
  if (!existsSync(join(options.clusterDirectory, "PG_VERSION"))) {
    await initializeCluster(options);
  }

  if (!(await isRunning(options))) {
    const result = await run(
      pgCtl,
      [
        "-D",
        options.clusterDirectory,
        "-l",
        join(options.clusterDirectory, "..", "logs", "postgres.log"),
        "-o",
        `-h 127.0.0.1 -p ${String(options.port)}`,
        "-w",
        "-t",
        "60",
        "start",
      ],
      options.log,
    );
    if (result.code !== 0) {
      throw new LocalPostgresError(
        /already in use|could not bind/i.test(result.output)
          ? `Port ${String(options.port)} is taken by another program, so the local database could not start.`
          : "The local database did not start. See logs/postgres.log in the data folder.",
      );
    }
  }

  const adminUrl = localUrl(options, "postgres");
  await ensureDatabase(adminUrl);

  let stopped = false;
  return {
    databaseUrl: localUrl(options, LOCAL_DATABASE_NAME),
    adminUrl,
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      await run(
        pgCtl,
        ["-D", options.clusterDirectory, "-m", "fast", "-w", "stop"],
        options.log,
      );
    },
  };
}
