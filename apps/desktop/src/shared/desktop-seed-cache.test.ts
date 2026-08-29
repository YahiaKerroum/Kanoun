import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DemoSeedResult } from "../../../../scripts/demo-types.js";
import { loadOrCreateSeedResult } from "./desktop-seed-cache.js";

function testSeedResult(): DemoSeedResult {
  return {
    businessCode: "dar-nedjma-demo",
    businessName: "Dar Nedjma Hospitality",
    restaurantName: "Dar Nedjma",
    branchName: "Hydra",
    roles: [
      {
        key: "owner",
        label: "Owner / administrator",
        displayName: "Nadia Cheriet",
        email: "nadia.cheriet@dar-nedjma.demo",
        target: "administration",
        password: "test-password-value",
      },
    ],
    customerUrls: [
      { tableCode: "T-12", url: "http://127.0.0.1:5174/t/abc123" },
    ],
    scenario: ["Guest scans the T-12 table QR and submits a menu order."],
  };
}

describe("loadOrCreateSeedResult", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mise-desktop-seed-cache-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("calls createSeedResult and persists it when no cache file exists", async () => {
    const file = join(directory, "seed-result.json");
    const created = testSeedResult();
    let calls = 0;
    const createSeedResult = (): Promise<DemoSeedResult> => {
      calls += 1;
      return Promise.resolve(created);
    };

    const result = await loadOrCreateSeedResult(file, createSeedResult);

    expect(calls).toBe(1);
    expect(result).toEqual(created);
    expect(existsSync(file)).toBe(true);
  });

  it("reads the cached result on a later call without calling createSeedResult again", async () => {
    const file = join(directory, "seed-result.json");
    const created = testSeedResult();
    await loadOrCreateSeedResult(file, () => Promise.resolve(created));
    let calls = 0;

    const result = await loadOrCreateSeedResult(file, () => {
      calls += 1;
      return Promise.resolve(created);
    });

    expect(calls).toBe(0);
    expect(result).toEqual(created);
  });
});
