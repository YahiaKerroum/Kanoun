import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(target)
        : entry.name.endsWith(".ts")
          ? [target]
          : [];
    }),
  );
  return nested.flat();
}

describe("PD-025 diagnostic test-support boundary", () => {
  it("keeps the diagnostic outside production composition and routes", async () => {
    const productionFiles = await Promise.all([
      sourceFiles(path.join(root, "apps", "api", "src")),
      sourceFiles(path.join(root, "apps", "worker", "src")),
    ]);
    const source = await Promise.all(
      productionFiles.flat().map((file) => readFile(file, "utf8")),
    );

    expect(source.join("\n")).not.toContain("pd025-guest-order-diagnostics");
    expect(source.join("\n")).not.toContain("pd025Diagnostic");
  });

  it("uses tenant and branch scope before returning diagnostic facts", async () => {
    const source = await readFile(
      path.join(
        root,
        "packages/test-support/src/pd025-guest-order-diagnostics.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      "where business_account_id = $1 and restaurant_id = $2 and id = $3",
    );
    expect(source).toContain('return { scope: "not_found" }');
  });

  it("does not include tokens, credentials, sessions, or limiter mutation", async () => {
    const source = await readFile(
      path.join(
        root,
        "packages/test-support/src/pd025-guest-order-diagnostics.ts",
      ),
      "utf8",
    );
    const orderingRouter = await readFile(
      path.join(root, "packages/modules/src/ordering/http/router.ts"),
      "utf8",
    );
    const publicTablesRouter = await readFile(
      path.join(root, "packages/modules/src/tables/http/public-router.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/token|credential|csrf|session|password/iu);
    expect(source).not.toMatch(/insert|update|delete/iu);
    expect(orderingRouter).toContain("limit: 60");
    expect(publicTablesRouter).toContain("limit: 60");
    expect(`${orderingRouter}\n${publicTablesRouter}`).not.toMatch(
      /performance|pd-025|test.?flag/iu,
    );
  });
});
