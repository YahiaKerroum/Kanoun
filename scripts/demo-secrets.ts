import { randomBytes } from "node:crypto";

export function generatedDemoSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function generatedDemoPassword(): string {
  return `aA0${randomBytes(18).toString("base64url")}`;
}
