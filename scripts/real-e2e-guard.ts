import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "node:fs/promises";

const forbiddenPatterns = [
  /\bpage\.route\s*\(/u,
  /\bcontext\.route\s*\(/u,
  /\bbrowserContext\.route\s*\(/u,
  /\broute\.(?:fulfill|continue|fallback)\s*\(/u,
];

export async function assertRealE2eSourceClean(
  directory = "apps/web/staff/e2e/real",
): Promise<void> {
  const files: string[] = [];
  for await (const file of glob(join(directory, "**/*.{ts,tsx,js,mjs}"))) {
    files.push(file);
  }
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        throw new Error(
          `Real-stack E2E source guard rejected ${file}: first-party interception is forbidden.`,
        );
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  await assertRealE2eSourceClean();
}
