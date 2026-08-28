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
