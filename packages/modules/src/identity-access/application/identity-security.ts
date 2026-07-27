import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { createOpaqueToken, hashOpaqueToken } from "@rms/building-blocks";

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export class IdentitySecurity {
  private readonly dummyHash: Promise<string>;

  public constructor(private readonly tokenSecret: string) {
    this.dummyHash = this.hashPassword(randomUUID());
  }

  public normalizeEmail(email: string): string {
    return email.trim().toLocaleLowerCase("en-US");
  }

  public hashPassword(password: string): Promise<string> {
    return argon2.hash(password, passwordHashOptions);
  }

  public async verifyPassword(
    password: string,
    passwordHash?: string,
  ): Promise<boolean> {
    const hash = passwordHash ?? (await this.dummyHash);
    try {
      const valid = await argon2.verify(hash, password);
      return Boolean(passwordHash) && valid;
    } catch {
      return false;
    }
  }

  public createToken(): { readonly raw: string; readonly hash: string } {
    const raw = createOpaqueToken();
    return { raw, hash: this.hashToken(raw) };
  }

  public hashToken(rawToken: string): string {
    return hashOpaqueToken(rawToken, this.tokenSecret);
  }
}
