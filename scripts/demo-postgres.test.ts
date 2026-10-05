import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  isExistingPostgresCluster,
  selectDemoPostgresMode,
  type DemoPostgresCapabilities,
} from "./demo-postgres.js";

describe("selectDemoPostgresMode", () => {
  it("uses the existing service when the role can create databases", () => {
    const capabilities: DemoPostgresCapabilities = {
      canCreateDatabase: true,
    };

    expect(selectDemoPostgresMode(capabilities)).toBe("existing");
  });

  it("uses an owned cluster when the existing role is restricted", () => {
    const capabilities: DemoPostgresCapabilities = {
      canCreateDatabase: false,
    };

    expect(selectDemoPostgresMode(capabilities)).toBe("isolated");
  });
});

describe("isExistingPostgresCluster", () => {
  let directory = "";

  afterEach(() => {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("is false for a directory with no PG_VERSION file", () => {
    directory = mkdtempSync(join(tmpdir(), "mise-postgres-cluster-"));

    expect(isExistingPostgresCluster(directory)).toBe(false);
  });

  it("is true once a PG_VERSION file exists", () => {
    directory = mkdtempSync(join(tmpdir(), "mise-postgres-cluster-"));
    writeFileSync(join(directory, "PG_VERSION"), "18\n", "utf8");

    expect(isExistingPostgresCluster(directory)).toBe(true);
  });

  it("is false for a directory that does not exist at all", () => {
    expect(
      isExistingPostgresCluster(join(tmpdir(), "does-not-exist-xyz")),
    ).toBe(false);
  });
});
