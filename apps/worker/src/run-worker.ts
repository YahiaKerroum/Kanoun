import { composeWorker } from "./composition-root.js";
import type { WorkerConfig } from "./config.js";
import {
  startWorkerMetricsListener,
  type WorkerMetricsListener,
} from "./metrics-listener.js";

export const WORKER_READY_MESSAGE =
  "Worker process is ready; outbox dispatch is active";

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Dispatches outbox events until `signal` aborts. Shared by the standalone
 * `worker.ts` entrypoint (which aborts on SIGINT/SIGTERM) and the desktop
 * runtime host (which aborts on an IPC shutdown request).
 */
export async function runWorker(
  config: WorkerConfig,
  signal: AbortSignal,
  options: { readonly onReady?: () => void } = {},
): Promise<void> {
  const worker = composeWorker(config);
  let metricsListener: WorkerMetricsListener | undefined;
  let observabilitySampler: ReturnType<typeof setInterval> | undefined;
  try {
    await worker.checkReadiness();
    worker.logger.info(WORKER_READY_MESSAGE);
    options.onReady?.();
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

    let lastRetentionAt = 0;
    while (!signal.aborted) {
      try {
        const outcome = await worker.processNext();
        if (Date.now() - lastRetentionAt >= 60 * 60_000) {
          const removed = await worker.runRetention();
          lastRetentionAt = Date.now();
          worker.logger.info({ removed }, "Worker retention completed");
        }
        if (outcome === "idle" || outcome === "retry_scheduled") {
          await pause(250, signal);
        }
      } catch (error: unknown) {
        worker.logger.error(
          { err: error instanceof Error ? error.message : "unknown_error" },
          "Worker iteration failed",
        );
        await pause(1_000, signal);
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

/** Schedules one quarantined outbox event for replay. */
export async function replayQuarantinedEvent(
  config: WorkerConfig,
  eventId: string,
): Promise<boolean> {
  const worker = composeWorker(config);
  try {
    await worker.checkReadiness();
    const replayed = await worker.replayQuarantined(eventId);
    if (replayed) {
      worker.logger.info(
        { eventId },
        "Quarantined outbox event scheduled for replay",
      );
    } else {
      worker.logger.warn({ eventId }, "Quarantined outbox event was not found");
    }
    return replayed;
  } finally {
    await worker.databasePool.end();
  }
}
