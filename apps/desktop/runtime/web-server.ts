import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const PROXIED_PREFIXES = ["/api/", "/health/"] as const;

export function contentTypeFor(path: string): string {
  return (
    CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

export function isProxiedPath(pathname: string): boolean {
  return PROXIED_PREFIXES.some(
    (prefix) => pathname.startsWith(prefix) || pathname === prefix.slice(0, -1),
  );
}

/**
 * Maps a request path to a file inside `root`, refusing anything that would
 * escape it. Returns undefined for traversal attempts.
 */
export function resolveStaticPath(
  root: string,
  pathname: string,
): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) {
    return undefined;
  }
  const candidate = normalize(join(root, decoded));
  const normalizedRoot = normalize(root.endsWith(sep) ? root : root + sep);
  return candidate.startsWith(normalizedRoot) ? candidate : undefined;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function proxy(
  request: IncomingMessage,
  response: ServerResponse,
  apiPort: number,
): void {
  const upstream = httpRequest(
    {
      host: "127.0.0.1",
      port: apiPort,
      method: request.method,
      path: request.url,
      // Keep the browser's Host/Origin so the API's origin checks see the
      // workspace origin, exactly as the Vite dev proxy does.
      headers: request.headers,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(503, { "content-type": "application/json" });
    }
    response.end(
      JSON.stringify({
        error: {
          code: "service_unavailable",
          message: "MISE is still starting. Try again in a moment.",
        },
      }),
    );
  });
  request.pipe(upstream);
}

/**
 * Adds the desktop's runtime origins to index.html so the staff and
 * back-office apps can link to each other without build-time ports.
 */
export function injectOrigins(
  html: string,
  origins: Readonly<Record<string, string>>,
): string {
  const content = JSON.stringify(origins)
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;");
  return html.replace(
    "<head>",
    `<head>\n    <meta name="mise-origins" content='${content}' />`,
  );
}

async function serveStatic(
  root: string,
  pathname: string,
  response: ServerResponse,
  origins: Readonly<Record<string, string>>,
): Promise<void> {
  const requested = resolveStaticPath(root, pathname);
  if (!requested) {
    response.writeHead(400).end();
    return;
  }
  // Single-page apps own their routes: unknown paths without a file
  // extension fall back to index.html.
  const target = (await isFile(requested))
    ? requested
    : extname(pathname) === ""
      ? join(root, "index.html")
      : undefined;
  if (!target) {
    response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  if (target.endsWith("index.html")) {
    response.writeHead(200, {
      "content-type": contentTypeFor(target),
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    response.end(injectOrigins(await readFile(target, "utf8"), origins));
    return;
  }
  const immutable = pathname.startsWith("/assets/");
  response.writeHead(200, {
    "content-type": contentTypeFor(target),
    "cache-control": immutable
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "x-content-type-options": "nosniff",
  });
  createReadStream(target).pipe(response);
}

export interface WebAppServerOptions {
  readonly root: string;
  readonly port: number;
  readonly apiPort: number;
  readonly origins: Readonly<Record<string, string>>;
}

export async function startWebAppServer(
  options: WebAppServerOptions,
): Promise<{ readonly close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (isProxiedPath(pathname)) {
      proxy(request, response, options.apiPort);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    void serveStatic(options.root, pathname, response, options.origins).catch(
      () => {
        if (!response.headersSent) {
          response.writeHead(500);
        }
        response.end();
      },
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
