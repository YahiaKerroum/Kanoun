import { describe, expect, it } from "vitest";
import { generatedDemoPassword } from "./demo-secrets.js";

describe("generatedDemoPassword", () => {
  it("satisfies bootstrap password requirements for every generated credential", () => {
    // Given: passwords used by both demo seeding and real-stack tenant setup.
    const passwords = Array.from({ length: 10_000 }, generatedDemoPassword);

    // When: each credential crosses the tenant-bootstrap validation boundary.
    const hasBootstrapRequirements = (password: string): boolean =>
      password.length >= 12 &&
      password.length <= 128 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password);

    // Then: random output never makes real-stack provisioning nondeterministic.
    expect(passwords.every(hasBootstrapRequirements)).toBe(true);
  });
});
