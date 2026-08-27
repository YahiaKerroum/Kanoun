import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const applicationDirectories = [
  "apps/web/customer/dist",
  "apps/web/staff/dist",
  "apps/web/admin/dist",
] as const;
const forbiddenMarkers = ["react-scan", "react-doctor", "react-grab"] as const;

async function filesIn(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesIn(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

for (const directory of applicationDirectories) {
  for (const file of await filesIn(directory)) {
    const source = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      if (source.includes(marker)) {
        throw new Error(
          `Production diagnostic exclusion failed: ${marker} found in ${file}.`,
        );
      }
    }
  }
}
