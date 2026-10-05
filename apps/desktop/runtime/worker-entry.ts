import process from "node:process";
import { loadWorkerConfig } from "../../worker/src/config.js";
import { runWorker } from "../../worker/src/run-worker.js";
import { onShutdownRequest, reportReady } from "./child-ipc.js";

const shutdown = new AbortController();
onShutdownRequest(() => {
  shutdown.abort();
});

await runWorker(loadWorkerConfig(process.env), shutdown.signal, {
  onReady: reportReady,
});
process.exit(0);
