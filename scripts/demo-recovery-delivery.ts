import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { z } from "zod";

const recoveryMessageSchema = z.object({
  type: z.literal("credential_recovery"),
  businessCode: z.string().min(1),
  email: z.email(),
  token: z.string().min(32),
  expiresAtUtc: z.iso.datetime(),
});

export interface DemoRecoveryDeliveryOptions {
  readonly host: string;
  readonly port: number;
  readonly authorizationSecret: string;
  readonly staffOrigin: string;
}

export interface DemoRecoveryDelivery {
  readonly origin: string;
  close(): Promise<void>;
}

let pendingRecovery:
  | {
      readonly businessCode: string;
      readonly email: string;
      readonly token: string;
      readonly expiresAtUtc: string;
    }
  | undefined;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function send(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.setHeader("cache-control", "no-store");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(body);
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > 16_384)
      throw new Error("Recovery delivery payload is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function inboxPage(options: DemoRecoveryDeliveryOptions): string {
  const link = pendingRecovery
    ? new URL("/auth/recover/complete", options.staffOrigin)
    : undefined;
  if (link && pendingRecovery)
    link.searchParams.set("token", pendingRecovery.token);
  const content = pendingRecovery
    ? `<p class="status">One recovery message is waiting for this local run.</p>
       <dl><dt>Business code</dt><dd>${escapeHtml(pendingRecovery.businessCode)}</dd><dt>Recipient</dt><dd>${escapeHtml(pendingRecovery.email)}</dd><dt>Expires</dt><dd>${escapeHtml(pendingRecovery.expiresAtUtc)}</dd></dl>
       <p><a href="${escapeHtml(link?.toString() ?? "")}">Open recovery form</a></p>`
    : `<p class="empty">No recovery request has been delivered in this run.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex,nofollow" /><title>Kanoun · Local recovery inbox</title><style>body{margin:0;min-width:320px;background:#ffb300;color:#1e1b14;font:16px/1.55 system-ui,sans-serif}.shell{width:min(680px,calc(100% - 32px));margin:10vh auto;padding:clamp(24px,6vw,56px);border-radius:20px;background:#fff}.eyebrow{color:#6e4700;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(2rem,6vw,4rem);line-height:1;margin:10px 0 18px}a{color:#6e4700;font-weight:800}dl{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;border-block:1px solid #efe7da;padding:18px 0}dt{color:#565044;font-weight:700}dd{margin:0;overflow-wrap:anywhere}.status{color:#1e7a47;font-weight:800}.empty{color:#565044}.warning{margin-top:26px;color:#7a2d26;font-size:.9rem}</style></head><body><main class="shell"><p class="eyebrow">Kanoun · Local synthetic demo</p><h1>Recovery inbox</h1>${content}<p class="warning">Loopback-only delivery substitute. No production email or external delivery claim is made. Tokens are held in process memory and disappear when the demo stops.</p></main></body></html>`;
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: DemoRecoveryDeliveryOptions,
): Promise<void> {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${options.host}:${options.port}`,
  );
  if (requestUrl.pathname === "/health/live" && request.method === "GET") {
    send(response, 200, "text/plain; charset=utf-8", "ok");
    return;
  }
  if (requestUrl.pathname === "/" && request.method === "GET") {
    response.setHeader(
      "content-security-policy",
      "default-src 'none'; style-src 'unsafe-inline';",
    );
    send(response, 200, "text/html; charset=utf-8", inboxPage(options));
    return;
  }
  if (requestUrl.pathname === "/deliver" && request.method === "POST") {
    if (
      request.headers.authorization !== `Bearer ${options.authorizationSecret}`
    ) {
      send(response, 401, "text/plain; charset=utf-8", "Unauthorized");
      return;
    }
    try {
      const message = recoveryMessageSchema.parse(
        JSON.parse(await requestBody(request)),
      );
      pendingRecovery = {
        businessCode: message.businessCode,
        email: message.email,
        token: message.token,
        expiresAtUtc: message.expiresAtUtc,
      };
      response.statusCode = 204;
      response.end();
    } catch {
      send(
        response,
        422,
        "text/plain; charset=utf-8",
        "Invalid recovery delivery",
      );
    }
    return;
  }
  send(response, 404, "text/plain; charset=utf-8", "Not found");
}

export async function startDemoRecoveryDelivery(
  options: DemoRecoveryDeliveryOptions,
): Promise<DemoRecoveryDelivery> {
  pendingRecovery = undefined;
  const server = createServer((request, response) => {
    void handle(request, response, options);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, options.host);
  });
  return {
    origin: `http://${options.host}:${options.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
