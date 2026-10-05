import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { describeDatabaseError } from "./database.js";
import { findPostgresBinDirectory } from "./local-postgres.js";
import {
  connectionSettingsSchema,
  describeDatabaseUrl,
  parseCommand,
} from "./protocol.js";
import {
  allocatePorts,
  generateSamplePassword,
  PREFERRED_PORTS,
} from "./settings.js";
import {
  contentTypeFor,
  injectOrigins,
  isProxiedPath,
  resolveStaticPath,
} from "./web-server.js";

const serverUrl = "postgresql://mise:s3cret@db.example.com:5432/mise";

describe("protocol", () => {
  it("accepts local mode and validated server URLs", () => {
    expect(connectionSettingsSchema.parse({ mode: "local" })).toEqual({
      mode: "local",
    });
    expect(
      connectionSettingsSchema.parse({
        mode: "server",
        databaseUrl: "postgres://u:p@host/db",
      }),
    ).toEqual({ mode: "server", databaseUrl: "postgresql://u:p@host/db" });
  });

  it("rejects server URLs without a database or with another scheme", () => {
    for (const databaseUrl of [
      "postgresql://u:p@host:5432",
      "mysql://u:p@host/db",
      "not a url",
    ]) {
      expect(
        connectionSettingsSchema.safeParse({ mode: "server", databaseUrl })
          .success,
      ).toBe(false);
    }
  });

  it("parses commands and keeps the id of malformed ones", () => {
    expect(parseCommand('{"id":3,"type":"status"}')).toEqual({
      ok: true,
      command: { id: 3, type: "status" },
    });
    expect(parseCommand('{"id":4,"type":"dropEverything"}')).toEqual({
      ok: false,
      id: 4,
    });
    expect(parseCommand("{oops")).toEqual({ ok: false });
  });

  it("describes a database URL without its password", () => {
    expect(describeDatabaseUrl(serverUrl)).toBe("db.example.com:5432/mise");
    expect(describeDatabaseUrl(serverUrl)).not.toContain("s3cret");
  });
});

describe("settings", () => {
  it("keeps preferred ports when they are free", async () => {
    await expect(allocatePorts(() => Promise.resolve(true))).resolves.toEqual(
      PREFERRED_PORTS,
    );
  });

  it("falls back to another port when a preferred one is taken", async () => {
    const ports = await allocatePorts(
      (port) => Promise.resolve(port !== PREFERRED_PORTS.api),
      () => Promise.resolve(50_123),
    );
    expect(ports.api).toBe(50_123);
    expect(ports.staff).toBe(PREFERRED_PORTS.staff);
  });

  it("generates sample passwords that satisfy the product policy", () => {
    const password = generateSamplePassword();
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/\d/);
  });
});

describe("web server", () => {
  const root = join(sep === "\\" ? "C:\\" : "/", "mise", "web", "staff");

  it("maps paths inside the app root and refuses traversal", () => {
    expect(resolveStaticPath(root, "/assets/app.js")).toBe(
      join(root, "assets", "app.js"),
    );
    expect(resolveStaticPath(root, "/../../secrets.json")).toBeUndefined();
    expect(
      resolveStaticPath(root, "/%2e%2e/%2e%2e/secrets.json"),
    ).toBeUndefined();
    expect(resolveStaticPath(root, "/%E0%A4%A")).toBeUndefined();
  });

  it("proxies only API and health paths", () => {
    expect(isProxiedPath("/api/v1/orders")).toBe(true);
    expect(isProxiedPath("/health/ready")).toBe(true);
    expect(isProxiedPath("/apiary")).toBe(false);
    expect(isProxiedPath("/orders")).toBe(false);
  });

  it("injects origins as an escaped meta tag", () => {
    const html = injectOrigins("<html><head></head></html>", {
      staff: "http://127.0.0.1:47301",
      admin: "http://127.0.0.1:47302'><script>",
    });
    expect(html).toContain('<meta name="mise-origins" content=\'');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("47302'>");
  });

  it("serves fonts and scripts with the right content types", () => {
    expect(contentTypeFor("a.woff2")).toBe("font/woff2");
    expect(contentTypeFor("a.JS")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("a.unknown")).toBe("application/octet-stream");
  });
});

describe("database errors", () => {
  it("explains refused connections without leaking the password", () => {
    const error = describeDatabaseError(
      Object.assign(new Error(`connect ECONNREFUSED ${serverUrl}`), {
        code: "ECONNREFUSED",
      }),
      serverUrl,
    );
    expect(error.title).toMatch(/refused/);
    expect(JSON.stringify(error)).not.toContain("s3cret");
  });

  it("explains authentication and missing-database failures", () => {
    expect(describeDatabaseError({ code: "28P01" }, serverUrl).title).toMatch(
      /sign-in/,
    );
    expect(describeDatabaseError({ code: "3D000" }, serverUrl).title).toMatch(
      /does not exist/,
    );
  });

  it("strips the full URL from unknown driver messages", () => {
    const error = describeDatabaseError(
      new Error(`something odd about ${serverUrl}`),
      serverUrl,
    );
    expect(error.detail).toContain("db.example.com:5432/mise");
    expect(error.detail).not.toContain("s3cret");
  });
});

describe("local PostgreSQL", () => {
  it("prefers the bundled binaries", () => {
    const bundled = join("R", "postgresql", "bin");
    expect(
      findPostgresBinDirectory("R", (path) => path.startsWith(bundled)),
    ).toBe(bundled);
  });

  it("returns undefined when no PostgreSQL is installed", () => {
    expect(findPostgresBinDirectory("R", () => false)).toBeUndefined();
  });
});
