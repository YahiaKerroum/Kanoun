import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

export interface DesktopSecrets {
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly recoveryDeliverySecret: string;
  readonly controlSecret: string;
  readonly databasePassword: string;
  readonly seedPassword: string;
}

const desktopSecretsSchema = z.object({
  sessionSecret: z.string().min(1),
  bootstrapSecret: z.string().min(1),
  supportAccessSecret: z.string().min(1),
  guestAccessSecret: z.string().min(1),
  recoveryDeliverySecret: z.string().min(1),
  controlSecret: z.string().min(1),
  databasePassword: z.string().min(1),
  seedPassword: z.string().min(12),
});

function generatedSecret(): string {
  return randomBytes(32).toString("base64url");
}

function generatedPassword(): string {
  return randomBytes(18).toString("base64url");
}

function createDesktopSecrets(): DesktopSecrets {
  return {
    sessionSecret: generatedSecret(),
    bootstrapSecret: generatedSecret(),
    supportAccessSecret: generatedSecret(),
    guestAccessSecret: generatedSecret(),
    recoveryDeliverySecret: generatedSecret(),
    controlSecret: generatedSecret(),
    databasePassword: generatedSecret(),
    seedPassword: generatedPassword(),
  };
}

export async function loadOrCreateDesktopSecrets(
  secretsFilePath: string,
): Promise<DesktopSecrets> {
  if (existsSync(secretsFilePath)) {
    const raw = await readFile(secretsFilePath, "utf8");
    return desktopSecretsSchema.parse(JSON.parse(raw));
  }
  const secrets = createDesktopSecrets();
  await writeFile(secretsFilePath, `${JSON.stringify(secrets, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return secrets;
}
