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
