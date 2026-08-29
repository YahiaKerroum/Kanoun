import { describe, expect, it } from "vitest";
import {
  buildDesktopDemoConfig,
  DESKTOP_POSTGRES_PORT,
  DESKTOP_POSTGRES_USERNAME,
} from "./desktop-config.js";

describe("buildDesktopDemoConfig", () => {
  it("builds a loopback database URL on the desktop postgres port with the desktop username", () => {
    const config = buildDesktopDemoConfig(
      "plain-password",
      "a-seed-password-1",
    );

    expect(config.databaseHost).toBe("127.0.0.1");
    expect(config.databasePort).toBe(DESKTOP_POSTGRES_PORT);
    expect(config.databaseName).toBe("rms_demo");
    expect(config.databaseMarker).toBe("MISE_LOCAL_SYNTHETIC_DEMO_V1");
    expect(config.databaseUrl).toBe(
      `postgresql://${DESKTOP_POSTGRES_USERNAME}:plain-password@127.0.0.1:${DESKTOP_POSTGRES_PORT}/rms_demo`,
    );
  });

  it("points the admin URL at the postgres maintenance database", () => {
    const config = buildDesktopDemoConfig(
      "plain-password",
      "a-seed-password-1",
    );

    expect(new URL(config.adminDatabaseUrl).pathname).toBe("/postgres");
  });

  it("URL-encodes special characters in the password", () => {
    const config = buildDesktopDemoConfig("p@ss/word?", "a-seed-password-1");

    expect(new URL(config.databaseUrl).password).toBe(
      encodeURIComponent("p@ss/word?"),
    );
  });

  it("carries the seed password through for seedDemo to use", () => {
    const config = buildDesktopDemoConfig(
      "plain-password",
      "a-seed-password-1",
    );

    expect(config.seedPassword).toBe("a-seed-password-1");
  });

  it("binds the launcher to loopback on the fixed launcher port", () => {
    const config = buildDesktopDemoConfig(
      "plain-password",
      "a-seed-password-1",
    );

    expect(config.launcherHost).toBe("127.0.0.1");
    expect(config.launcherPort).toBe(4170);
  });
});
