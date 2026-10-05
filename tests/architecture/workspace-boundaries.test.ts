import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const requiredWorkspacePaths = [
  "apps/api/src/app.ts",
  "apps/api/src/server.ts",
  "apps/api/src/composition-root.ts",
  "apps/worker/src/worker.ts",
  "apps/worker/src/composition-root.ts",
  "apps/web/customer",
  "apps/web/staff",
  "apps/web/admin",
  "packages/modules/src/identity-access",
  "packages/modules/src/restaurant-configuration",
  "packages/modules/src/menu",
  "packages/modules/src/tables",
  "packages/modules/src/ordering",
  "packages/modules/src/kitchen",
  "packages/modules/src/payments",
  "packages/modules/src/notifications",
  "packages/modules/src/reporting",
  "packages/modules/src/audit",
  "packages/service-workflow",
  "packages/building-blocks",
  "packages/contracts",
  "packages/test-support",
] as const;

describe("workspace architecture", () => {
  it("contains every required logical boundary", async () => {
    const checks = await Promise.all(
      requiredWorkspacePaths.map(async (relativePath) => {
        const resolvedPath = path.join(root, relativePath);
        await expect(stat(resolvedPath)).resolves.toBeDefined();
      }),
    );

    expect(checks).toHaveLength(requiredWorkspacePaths.length);
  });

  it("keeps server startup outside the Express application factory", async () => {
    const appSource = await readFile(
      path.join(root, "apps/api/src/app.ts"),
      "utf8",
    );
    const serverSource = await readFile(
      path.join(root, "apps/api/src/http-server.ts"),
      "utf8",
    );

    expect(appSource).not.toContain(".listen(");
    expect(serverSource).toContain(".listen(");
  });

  it("keeps the worker independent from the Express application", async () => {
    const workerSource = await readFile(
      path.join(root, "apps/worker/src/worker.ts"),
      "utf8",
    );

    expect(workerSource).not.toMatch(/from ["']express["']/);
    expect(workerSource).not.toContain("apps/api");
  });
});
