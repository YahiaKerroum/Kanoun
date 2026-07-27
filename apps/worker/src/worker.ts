import { once } from "node:events";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { composeWorker } from "./composition-root.js";
import { loadWorkerConfig } from "./config.js";

const environmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const config = loadWorkerConfig(process.env);
const worker = composeWorker(config);

await worker.checkReadiness();
worker.logger.info(
  "Worker process is ready; outbox dispatch is activated by a later delivery slice",
);

await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);
worker.logger.info("Worker process is shutting down");
await worker.databasePool.end();
