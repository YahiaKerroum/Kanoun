import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
// Mirrors scripts/demo-types.ts's exported DemoSeedResult (and its
// DemoRoleCredential/DemoCustomerUrl fields). Duplicated, not imported, for
// the same rootDir reason documented in desktop-config.ts. Must stay in
// sync with that file.
export interface DemoRoleCredential {
  readonly key: "owner" | "general-staff" | "kitchen" | "cashier";
  readonly label: string;
  readonly displayName: string;
  readonly email: string;
  readonly target: "administration" | "staff";
  readonly password: string;
}

export interface DemoCustomerUrl {
  readonly tableCode: string;
  readonly url: string;
}

export interface DemoSeedResult {
  readonly businessCode: string;
  readonly businessName: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly roles: readonly DemoRoleCredential[];
  readonly customerUrls: readonly DemoCustomerUrl[];
  readonly scenario: readonly string[];
}

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
