import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDatabasePool, type DatabasePool } from "@rms/building-blocks";
import type { DemoConfig } from "./demo-config.js";

const executeFile = promisify(execFile);
const localPostgresVersion = "18" as const;
const loopbackHost = "127.0.0.1" as const;

export function isExistingPostgresCluster(clusterDirectory: string): boolean {
  return existsSync(join(clusterDirectory, "PG_VERSION"));
}

export interface DemoPostgresCapabilities {
  readonly canCreateDatabase: boolean;
}

export type DemoPostgresMode = "existing" | "isolated";

export interface IsolatedDemoPostgresRuntime {
  readonly config: DemoConfig;
  readonly mode: "isolated";
  close(): Promise<void>;
}

export class DemoPostgresError extends Error {
  public readonly name = "DemoPostgresError";

  public constructor(operation: string) {
    super(
      `Could not complete the local PostgreSQL demo operation: ${operation}.`,
    );
  }
}

export function selectDemoPostgresMode(
  capabilities: DemoPostgresCapabilities,
): DemoPostgresMode {
  return capabilities.canCreateDatabase ? "existing" : "isolated";
}

interface PostgresRoleRow {
  readonly canCreateDatabase: boolean;
}

async function withSingleConnection<T>(
  connectionString: string,
  operation: (pool: DatabasePool) => Promise<T>,
): Promise<T> {
  const pool = createDatabasePool({
    connectionString,
    applicationName: "rms-demo-postgres-supervisor",
    maximumConnections: 1,
  });
  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

export async function inspectDemoPostgresCapabilities(
  connectionString: string,
): Promise<DemoPostgresCapabilities> {
  const row = await withSingleConnection(connectionString, async (pool) => {
    const result = await pool.query<PostgresRoleRow>(
      `select rolcreatedb as "canCreateDatabase"
       from pg_catalog.pg_roles
       where rolname = current_user`,
    );
    return result.rows[0];
  });
  return { canCreateDatabase: row?.canCreateDatabase === true };
}

async function waitForDatabase(
  connectionString: string,
  timeoutMilliseconds = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      await withSingleConnection(connectionString, async (pool) => {
        await pool.query("select 1");
      });
      return;
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  throw new DemoPostgresError("waiting for the owned PostgreSQL cluster");
}

export async function findFreeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopbackHost, () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  if (address === null || typeof address === "string") {
    throw new DemoPostgresError("resolving a loopback port");
  }
  return address.port;
}

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
  const roots = [process.env.ProgramW6432, process.env.ProgramFiles].filter(
    (root): root is string => typeof root === "string" && root.length > 0,
  );
  const binaryName = postgresBinaryName(binary);
  return [
    ...roots.map((root) =>
      join(root, "PostgreSQL", localPostgresVersion, "bin", binaryName),
    ),
    join(
      "C:\\Program Files",
      "PostgreSQL",
      localPostgresVersion,
      "bin",
      binaryName,
    ),
  ];
}

async function findPostgresBinary(binary: string): Promise<string | undefined> {
  const bundled = bundledBinaryCandidate(binary);
  const candidates = [
    ...(bundled ? [bundled] : []),
    ...(process.platform === "win32"
      ? existingWindowsBinaryCandidates(binary)
      : [postgresBinaryName(binary)]),
  ];
  const candidate = candidates.find((path) => existsSync(path));
  if (candidate) {
    return candidate;
  }
  try {
    const result = await executeFile(
      process.platform === "win32" ? "where.exe" : "which",
      [postgresBinaryName(binary)],
      { windowsHide: true },
    );
    return result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}

async function runPostgresControlCommand(
  executable: string,
  args: readonly string[],
  operation: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => {
      reject(new DemoPostgresError(operation));
    });
    child.once("exit", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new DemoPostgresError(operation));
    });
  });
}

function decodedUrlComponent(value: string, operation: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error: unknown) {
    if (error instanceof URIError) {
      throw new DemoPostgresError(operation);
    }
    throw error;
  }
}

function isolatedConfig(
  config: DemoConfig,
  port: number,
  username: string,
  password: string,
): DemoConfig {
  const databaseUrl = new URL(config.databaseUrl);
  databaseUrl.hostname = loopbackHost;
  databaseUrl.port = String(port);
  databaseUrl.username = username;
  databaseUrl.password = password;
  databaseUrl.pathname = `/${config.databaseName}`;
  const adminDatabaseUrl = new URL(databaseUrl);
  adminDatabaseUrl.pathname = "/postgres";
  return {
    ...config,
    databaseUrl: databaseUrl.toString(),
    databaseHost: loopbackHost,
    databasePort: port,
    adminDatabaseUrl: adminDatabaseUrl.toString(),
  };
}

export async function startIsolatedDemoPostgres(
  config: DemoConfig,
): Promise<IsolatedDemoPostgresRuntime> {
  const initdb = await findPostgresBinary("initdb");
  const pgCtl = await findPostgresBinary("pg_ctl");
  if (!initdb || !pgCtl) {
    throw new DemoPostgresError("locating PostgreSQL 18.1 binaries");
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "rms-demo-postgres-"),
  );
  const clusterDirectory = join(temporaryDirectory, "data");
  const passwordFile = join(temporaryDirectory, "demo-password");
  const targetUrl = new URL(config.databaseUrl);
  const username = decodedUrlComponent(
    targetUrl.username || "rms",
    "reading the PostgreSQL username",
  );
  const password = targetUrl.password
    ? decodedUrlComponent(targetUrl.password, "reading the PostgreSQL password")
    : randomBytes(24).toString("base64url");
  const port = await findFreeLoopbackPort();
  const runtimeConfig = isolatedConfig(config, port, username, password);
  let started = false;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      if (started) {
        await runPostgresControlCommand(
          pgCtl,
          ["-D", clusterDirectory, "-m", "fast", "-w", "stop"],
          "stopping the owned PostgreSQL cluster",
        );
        started = false;
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };

  try {
    await writeFile(passwordFile, `${password}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
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
      "initializing the owned PostgreSQL cluster",
    );
    await runPostgresControlCommand(
      pgCtl,
      [
        "-D",
        clusterDirectory,
        "-o",
        `-h ${loopbackHost} -p ${String(port)}`,
        "-w",
        "start",
      ],
      "starting the owned PostgreSQL cluster",
    );
    started = true;
    await waitForDatabase(runtimeConfig.adminDatabaseUrl);
    return {
      config: runtimeConfig,
      mode: "isolated",
      close,
    };
  } catch (error: unknown) {
    try {
      await close();
    } catch (cleanupError: unknown) {
      if (!(cleanupError instanceof Error)) {
        throw cleanupError;
      }
    }
    throw error;
  } finally {
    await rm(passwordFile, { force: true });
  }
}

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
