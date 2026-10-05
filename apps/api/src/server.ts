import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadApiConfig } from "./config.js";
import { startApiServer } from "./http-server.js";

const environmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const config = loadApiConfig(process.env);
const api = await startApiServer(config);
process.stdout.write(`API listening on http://${config.host}:${config.port}\n`);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stdout.write(`Received ${signal}; shutting down API.\n`);
  try {
    await api.close();
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "API shutdown failed"}\n`,
    );
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
