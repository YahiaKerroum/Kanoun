import { once } from "node:events";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { composeWorker } from "./composition-root.js";
import { loadWorkerConfig } from "./config.js";
import {
  startWorkerMetricsListener,
  type WorkerMetricsListener,
} from "./metrics-listener.js";

async function run(): Promise<void> {
  const environmentFile = fileURLToPath(
    new URL("../../../.env", import.meta.url),
  );
  if (existsSync(environmentFile)) {
    process.loadEnvFile(environmentFile);
  }

  const config = loadWorkerConfig(process.env);
  const worker = composeWorker(config);
  let metricsListener: WorkerMetricsListener | undefined;
  let observabilitySampler: ReturnType<typeof setInterval> | undefined;
  try {
    await worker.checkReadiness();
    const replayArgument = process.argv.indexOf("--replay-quarantined");
    if (replayArgument >= 0) {
      const eventId = z.uuid().safeParse(process.argv[replayArgument + 1]);
      if (!eventId.success) {
        throw new Error(
          "--replay-quarantined requires one valid outbox event UUID",
        );
      }
      const replayed = await worker.replayQuarantined(eventId.data);
      if (!replayed) {
        worker.logger.warn(
          { eventId: eventId.data },
          "Quarantined outbox event was not found",
        );
        process.exitCode = 2;
        return;
      }
      worker.logger.info(
        { eventId: eventId.data },
        "Quarantined outbox event scheduled for replay",
      );
      return;
    }

    worker.logger.info("Worker process is ready; outbox dispatch is active");
    if (config.metricsHost) {
      metricsListener = await startWorkerMetricsListener({
        host: config.metricsHost,
        port: config.metricsPort,
        read: () =>
          JSON.stringify({
            service: "rms-worker",
            metrics: worker.serviceMetrics.snapshot(),
            alerts: worker.alertEvaluator.active,
          }),
      });
      worker.logger.info(
        { host: config.metricsHost, port: config.metricsPort },
        "Worker metrics listener started",
      );
    }
    await worker.sampleObservability();
    observabilitySampler = setInterval(() => {
      void worker.sampleObservability();
    }, 15_000);
    observabilitySampler.unref();
    const stopped = Promise.race([
      once(process, "SIGINT"),
      once(process, "SIGTERM"),
    ]);
    const shutdown = new AbortController();
    void stopped.then(() => {
      shutdown.abort();
    });
    let lastRetentionAt = 0;
    while (!shutdown.signal.aborted) {
      try {
        const outcome = await worker.processNext();
        if (Date.now() - lastRetentionAt >= 60 * 60_000) {
          const removed = await worker.runRetention();
          lastRetentionAt = Date.now();
          worker.logger.info({ removed }, "Worker retention completed");
        }
        if (outcome === "idle" || outcome === "retry_scheduled") {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch (error: unknown) {
        worker.logger.error(
          { err: error instanceof Error ? error.message : "unknown_error" },
          "Worker iteration failed",
        );
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    worker.logger.info("Worker process is shutting down");
  } finally {
    if (observabilitySampler) {
      clearInterval(observabilitySampler);
    }
    if (metricsListener) {
      await metricsListener.close().catch(() => undefined);
    }
    await worker.databasePool.end();
  }
}

await run();
