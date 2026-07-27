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
