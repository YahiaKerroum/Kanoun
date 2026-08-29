import { describe, expect, it } from "vitest";
import {
  page,
  roleCardHref,
  type DemoLauncherOptions,
} from "./demo-launcher.js";
import type { DemoRoleCredential, DemoSeedResult } from "./demo-types.js";

function testResult(): DemoSeedResult {
  return {
    businessCode: "dar-nedjma-demo",
    businessName: "Dar Nedjma Hospitality",
    restaurantName: "Dar Nedjma",
    branchName: "Hydra",
    roles: [
      {
        key: "owner",
        label: "Owner / administrator",
        displayName: "Nadia Cheriet",
        email: "nadia.cheriet@dar-nedjma.demo",
        target: "administration",
        password: "test-password-value",
      },
      {
        key: "kitchen",
        label: "Kitchen staff",
        displayName: "Yacine Bensaid",
        email: "yacine.bensaid@dar-nedjma.demo",
        target: "staff",
        password: "test-password-value",
      },
    ],
    customerUrls: [
      { tableCode: "T-12", url: "http://127.0.0.1:5174/t/abc123" },
    ],
    scenario: ["Guest scans the T-12 table QR and submits a menu order."],
  };
}

function testOptions(
  overrides: Partial<DemoLauncherOptions> = {},
): DemoLauncherOptions {
  return {
    result: testResult(),
    apiOrigin: "http://127.0.0.1:3000",
    adminOrigin: "http://127.0.0.1:5175",
    staffOrigin: "http://127.0.0.1:5173",
    recoveryOrigin: "http://127.0.0.1:4171",
    host: "127.0.0.1",
    port: 4170,
    ...overrides,
  };
}

function role(options: DemoLauncherOptions, index: number): DemoRoleCredential {
  const found = options.result.roles[index];
  if (!found) {
    throw new Error(`Test fixture is missing role at index ${String(index)}.`);
  }
  return found;
}

describe("roleCardHref", () => {
  it("links to the auto-login launch path by default", () => {
    const options = testOptions();

    const link = roleCardHref(role(options, 0), options);

    expect(link.href).toBe("/launch/owner");
    expect(link.target).toBeUndefined();
  });

  it("links to the real staff sign-in screen in direct-sign-in mode", () => {
    const options = testOptions({ roleLinkMode: "direct-sign-in" });

    const link = roleCardHref(role(options, 1), options);

    expect(link.href).toBe("http://127.0.0.1:5173/auth/sign-in");
    expect(link.target).toBe("Kitchen staff");
  });

  it("links to the real administration sign-in screen for the owner role in direct-sign-in mode", () => {
    const options = testOptions({ roleLinkMode: "direct-sign-in" });

    const link = roleCardHref(role(options, 0), options);

    expect(link.href).toBe("http://127.0.0.1:5175/auth/sign-in");
    expect(link.target).toBe("Owner / administrator");
  });
});

describe("page", () => {
  it("renders auto-login launch links by default and keeps the automation helper", () => {
    const html = page(testOptions());

    expect(html).toContain('href="/launch/owner">Open administration</a>');
    expect(html).toContain("corepack pnpm demo:contexts");
  });

  it("renders direct sign-in links named per role and drops the automation helper", () => {
    const html = page(testOptions({ roleLinkMode: "direct-sign-in" }));

    expect(html).toContain(
      'href="http://127.0.0.1:5175/auth/sign-in" target="Owner / administrator"',
    );
    expect(html).not.toContain("corepack pnpm demo:contexts");
  });
});
