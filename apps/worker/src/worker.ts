import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadWorkerConfig } from "./config.js";
import { replayQuarantinedEvent, runWorker } from "./run-worker.js";

const environmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);
if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const config = loadWorkerConfig(process.env);
const replayArgument = process.argv.indexOf("--replay-quarantined");

if (replayArgument >= 0) {
  const eventId = z.uuid().safeParse(process.argv[replayArgument + 1]);
  if (!eventId.success) {
    throw new Error(
      "--replay-quarantined requires one valid outbox event UUID",
    );
  }
  const replayed = await replayQuarantinedEvent(config, eventId.data);
  if (!replayed) {
    process.exitCode = 2;
  }
} else {
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  await runWorker(config, shutdown.signal);
}
