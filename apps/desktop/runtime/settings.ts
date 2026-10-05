import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  connectionSettingsSchema,
  type ConnectionSettings,
  type SampleRestaurant,
} from "./protocol.js";

export interface DataPaths {
  readonly root: string;
  readonly settingsFile: string;
  readonly secretsFile: string;
  readonly sampleFile: string;
  readonly clusterDirectory: string;
  readonly logFile: string;
}

export function resolveDataPaths(root: string): DataPaths {
  return {
    root,
    settingsFile: join(root, "settings.json"),
    secretsFile: join(root, "secrets.json"),
    sampleFile: join(root, "sample-restaurant.json"),
    clusterDirectory: join(root, "postgres"),
    logFile: join(root, "logs", "runtime.log"),
  };
}

const portSchema = z.number().int().min(1024).max(65_535);

const portsSchema = z.object({
  api: portSchema,
  staff: portSchema,
  admin: portSchema,
  guest: portSchema,
  postgres: portSchema,
  recovery: portSchema,
});

export type RuntimePorts = z.infer<typeof portsSchema>;

/**
 * Preferred loopback ports. They are fixed rather than random because table
 * QR links embed the guest origin; a port that moved between launches would
 * silently break every printed QR code.
 */
export const PREFERRED_PORTS: RuntimePorts = {
  api: 47_300,
  staff: 47_301,
  admin: 47_302,
  guest: 47_303,
  postgres: 47_304,
  recovery: 47_305,
};

const settingsSchema = z.object({
  version: z.literal(1),
  connection: connectionSettingsSchema,
  ports: portsSchema,
});

export type DesktopSettings = z.infer<typeof settingsSchema>;

const secretsSchema = z.object({
  sessionSecret: z.string().min(32),
  bootstrapSecret: z.string().min(32),
  supportAccessSecret: z.string().min(32),
  guestAccessSecret: z.string().min(32),
  recoveryDeliverySecret: z.string().min(32),
  localDatabasePassword: z.string().min(24),
  samplePassword: z.string().min(12),
});

export type DesktopSecrets = z.infer<typeof secretsSchema>;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Writes through a temporary file so a crash never leaves half a file. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

export async function loadSettings(
  paths: DataPaths,
): Promise<DesktopSettings | undefined> {
  const raw = await readJson(paths.settingsFile);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function saveSettings(
  paths: DataPaths,
  settings: DesktopSettings,
): Promise<void> {
  await writeJson(paths.settingsFile, settings);
}

function secret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** A sample-staff password that satisfies the product's password policy. */
export function generateSamplePassword(): string {
  return `Mise-${secret(9)}-7a`;
}

export async function loadOrCreateSecrets(
  paths: DataPaths,
): Promise<DesktopSecrets> {
  const parsed = secretsSchema.safeParse(await readJson(paths.secretsFile));
  if (parsed.success) {
    return parsed.data;
  }
  const created: DesktopSecrets = {
    sessionSecret: secret(),
    bootstrapSecret: secret(),
    supportAccessSecret: secret(),
    guestAccessSecret: secret(),
    recoveryDeliverySecret: secret(),
    localDatabasePassword: secret(24),
    samplePassword: generateSamplePassword(),
  };
  await writeJson(paths.secretsFile, created);
  return created;
}

const sampleSchema = z.object({
  businessCode: z.string(),
  restaurantName: z.string(),
  branchName: z.string(),
  password: z.string(),
  roles: z.array(
    z.object({
      label: z.string(),
      displayName: z.string(),
      email: z.string(),
      workspace: z.enum(["staff", "admin"]),
    }),
  ),
  tableUrl: z.string().optional(),
  tableCode: z.string().optional(),
});

export async function loadSample(
  paths: DataPaths,
): Promise<SampleRestaurant | undefined> {
  const parsed = sampleSchema.safeParse(await readJson(paths.sampleFile));
  if (!parsed.success) {
    return undefined;
  }
  const { tableUrl, tableCode, ...rest } = parsed.data;
  return {
    ...rest,
    ...(tableUrl ? { tableUrl } : {}),
    ...(tableCode ? { tableCode } : {}),
  };
}

export async function saveSample(
  paths: DataPaths,
  sample: SampleRestaurant | undefined,
): Promise<void> {
  await writeJson(paths.sampleFile, sample ?? null);
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function anyFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate a loopback port."));
        }
      });
    });
  });
}

/** Uses the preferred ports where free and falls back to free ones. */
export async function allocatePorts(
  isFree: (port: number) => Promise<boolean> = isPortFree,
  fallback: () => Promise<number> = anyFreePort,
): Promise<RuntimePorts> {
  const entries = Object.entries(PREFERRED_PORTS) as [
    keyof RuntimePorts,
    number,
  ][];
  const allocated: Partial<Record<keyof RuntimePorts, number>> = {};
  for (const [name, preferred] of entries) {
    allocated[name] = (await isFree(preferred)) ? preferred : await fallback();
  }
  return portsSchema.parse(allocated);
}

export function settingsFor(
  connection: ConnectionSettings,
  ports: RuntimePorts,
): DesktopSettings {
  return { version: 1, connection, ports };
}
