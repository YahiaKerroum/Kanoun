import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" && !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "CI PostgreSQL integration tests require TEST_DATABASE_URL; refusing to run with skipped database coverage.",
  );
}

export default defineConfig({
  resolve: {
    alias: {
      "@rms/building-blocks": fileURLToPath(
        new URL("./packages/building-blocks/src/index.ts", import.meta.url),
      ),
      "@rms/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@rms/modules": fileURLToPath(
        new URL("./packages/modules/src/index.ts", import.meta.url),
      ),
      "@rms/service-workflow": fileURLToPath(
        new URL("./packages/service-workflow/src/index.ts", import.meta.url),
      ),
      "@rms/test-support": fileURLToPath(
        new URL("./packages/test-support/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
