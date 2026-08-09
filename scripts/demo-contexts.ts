import process from "node:process";
import { chromium } from "@playwright/test";
import { z } from "zod";

const manifestSchema = z.object({
  label: z.literal("Local synthetic demo"),
  businessCode: z.string(),
  restaurantName: z.string(),
  branchName: z.string(),
  roles: z.array(
    z.object({
      key: z.enum(["owner", "general-staff", "kitchen", "cashier"]),
      label: z.string(),
      target: z.enum(["administration", "staff"]),
      launchPath: z.string().startsWith("/launch/"),
    }),
  ),
  customerUrls: z.array(z.object({ tableCode: z.string(), url: z.url() })),
});

async function main(): Promise<void> {
  const launcherOrigin =
    process.env.DEMO_LAUNCHER_URL ?? "http://127.0.0.1:4170";
  const response = await fetch(new URL("/manifest", launcherOrigin));
  if (!response.ok) {
    throw new Error(
      "The demo launcher is not ready. Start `corepack pnpm dev:demo` first.",
    );
  }
  const manifest = manifestSchema.parse(await response.json());
  const browser = await chromium.launch({ headless: false });
  const contexts = [];
  try {
    for (const role of manifest.roles) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(new URL(role.launchPath, launcherOrigin).toString(), {
        waitUntil: "domcontentloaded",
      });
    }
    for (const customer of manifest.customerUrls) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(customer.url, { waitUntil: "domcontentloaded" });
    }
    process.stdout.write(
      `[demo] Opened ${contexts.length} isolated browser contexts for ${manifest.restaurantName}. Press Ctrl+C to close them.\n`,
    );
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Could not open demo contexts."}\n`,
  );
  process.exitCode = 1;
});
