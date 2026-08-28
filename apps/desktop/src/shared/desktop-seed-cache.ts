import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { DemoSeedResult } from "../../../../scripts/demo-types.js";

const demoSeedResultSchema = z.object({
  businessCode: z.string(),
  businessName: z.string(),
  restaurantName: z.string(),
  branchName: z.string(),
  roles: z.array(
    z.object({
      key: z.enum(["owner", "general-staff", "kitchen", "cashier"]),
      label: z.string(),
      displayName: z.string(),
      email: z.string(),
      target: z.enum(["administration", "staff"]),
      password: z.string(),
    }),
  ),
  customerUrls: z.array(z.object({ tableCode: z.string(), url: z.string() })),
  scenario: z.array(z.string()),
});

export async function loadOrCreateSeedResult(
  seedResultFile: string,
  createSeedResult: () => Promise<DemoSeedResult>,
): Promise<DemoSeedResult> {
  if (existsSync(seedResultFile)) {
    const raw = await readFile(seedResultFile, "utf8");
    return demoSeedResultSchema.parse(JSON.parse(raw));
  }
  const result = await createSeedResult();
  await writeFile(seedResultFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
