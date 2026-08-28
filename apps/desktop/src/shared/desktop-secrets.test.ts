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
