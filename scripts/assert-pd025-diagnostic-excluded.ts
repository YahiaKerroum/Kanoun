import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const forbidden = [
  "pd025-guest-order-diagnostics",
  "inspectPd025GuestOrderReadiness",
] as const;

async function files(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? files(target)
        : entry.name.endsWith(".js")
          ? [target]
          : [];
    }),
  );
  return nested.flat();
}

async function main(): Promise<void> {
  const productionOutputs = [
    path.join(root, "apps", "api", "dist"),
    path.join(root, "apps", "worker", "dist"),
  ];
  const outputFiles = (
    await Promise.all(productionOutputs.map((directory) => files(directory)))
  ).flat();
  const contents = await Promise.all(
    outputFiles.map((file) => readFile(file, "utf8")),
  );
  const included = forbidden.find((value) =>
    contents.some((source) => source.includes(value)),
  );
  if (included) {
    throw new Error(
      `Production output must not include private PD-025 diagnostics (${included}).`,
    );
  }
}

await main();
