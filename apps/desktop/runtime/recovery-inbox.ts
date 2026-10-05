import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import type { RecoveryMessage } from "./protocol.js";

const deliverySchema = z.object({
  type: z.literal("credential_recovery"),
  businessCode: z.string().min(1).max(64),
  email: z.email(),
  token: z.string().min(32).max(512),
  expiresAtUtc: z.iso.datetime(),
});

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    total += buffer.byteLength;
    if (total > 16_384) {
      throw new Error("Payload too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function bearerMatches(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(header ?? "");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export interface RecoveryInboxOptions {
  readonly port: number;
  readonly secret: string;
  readonly staffOrigin: string;
  readonly onMessage: (message: RecoveryMessage) => void;
}

/**
 * Stands in for an email service on a desktop install: the API delivers
 * password-reset tokens here, and the launcher shows them to whoever is at
 * the counter. Loopback-only and authenticated with a per-install secret.
 */
export async function startRecoveryInbox(
  options: RecoveryInboxOptions,
): Promise<{ readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/deliver") {
      response.writeHead(404).end();
      return;
    }
    if (!bearerMatches(request.headers.authorization, options.secret)) {
      response.writeHead(401).end();
      return;
    }
    readBody(request)
      .then((body) => {
        const message = deliverySchema.parse(JSON.parse(body));
        const url = new URL("/auth/recover/complete", options.staffOrigin);
        url.searchParams.set("token", message.token);
        options.onMessage({
          email: message.email,
          businessCode: message.businessCode,
          url: url.toString(),
          expiresAtUtc: message.expiresAtUtc,
        });
        response.writeHead(204).end();
      })
      .catch(() => {
        response.writeHead(400).end();
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
