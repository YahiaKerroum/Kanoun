import { describe, expect, it } from "vitest";
// @ts-expect-error — .cjs config has no type declarations; its shape is verified by the assertions below.
import config from "./electron-builder.config.cjs";

describe("electron-builder.config.cjs", () => {
  it("names the app MISE Desktop with a stable app id", () => {
    expect(config.productName).toBe("MISE Desktop");
    expect(config.appId).toBe("com.mise.desktop");
  });

  it("outputs packaged artifacts to release/, not dist/ (which holds compiled source)", () => {
    expect(config.directories.output).toBe("release");
  });

  it("targets both an NSIS installer and a portable exe on Windows", () => {
    expect(config.win.target).toEqual(
      expect.arrayContaining(["nsis", "portable"]),
    );
  });

  it("bundles the vendored PostgreSQL binaries as extraResources", () => {
    const postgresResource = config.extraResources.find(
      (resource: { to: string }) => resource.to === "postgresql",
    );
    expect(postgresResource).toBeDefined();
    expect(postgresResource.from).toBe("vendor/postgresql");
  });

  it("bundles the built api, worker, web apps, scripts, and node_modules under app-bundle", () => {
    const destinations = config.extraResources.map(
      (resource: { to: string }) => resource.to,
    );
    expect(destinations).toEqual(
      expect.arrayContaining([
        "app-bundle/scripts",
        "app-bundle/apps/api/dist",
        "app-bundle/apps/worker/dist",
        "app-bundle/apps/web/customer/dist",
        "app-bundle/apps/web/staff/dist",
        "app-bundle/apps/web/admin/dist",
        "app-bundle/node_modules",
      ]),
    );
  });
});
