import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { composeApi } from "./composition-root.js";
import { loadApiConfig } from "./config.js";

const environmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const config = loadApiConfig(process.env);
const { app, databasePool } = composeApi(config);

const server = app.listen(config.port, config.host, () => {
  process.stdout.write(
    `API listening on http://${config.host}:${config.port}\n`,
  );
});

/**
 * Node's 5s default is shorter than the idle gaps real keep-alive clients
 * (browsers, load balancers, our own load-profile harness) leave between
 * requests on the same connection, so the server closes the socket first.
 * Under sustained concurrent traffic that forces most requests onto a fresh
 * TCP handshake instead of a reused connection, which exhausted local
 * loopback socket resources (ENOBUFS) during PD-025 load testing. 30s
 * comfortably exceeds every client's idle gap and matches common reverse
 * proxy/load balancer keep-alive conventions.
 */
server.keepAliveTimeout = 30_000;

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stdout.write(`Received ${signal}; shutting down API.\n`);

  const serverError = await new Promise<Error | undefined>((resolve) => {
    server.close((error) => resolve(error));
  });
  await databasePool.end();

  if (serverError) {
    process.stderr.write(`${serverError.message}\n`);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
