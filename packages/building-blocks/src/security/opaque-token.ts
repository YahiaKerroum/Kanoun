import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function secretsMatch(actual: string, expected: string): boolean {
  const actualHash = createHmac("sha256", "rms-secret-comparison")
    .update(actual)
    .digest();
  const expectedHash = createHmac("sha256", "rms-secret-comparison")
    .update(expected)
    .digest();
  return timingSafeEqual(actualHash, expectedHash);
}
