import { Router } from "express";
import type { ActiveAlert, MetricsSnapshot } from "@rms/building-blocks";

export interface HealthMetricsReading {
  readonly snapshot: MetricsSnapshot;
  readonly alerts: readonly ActiveAlert[];
}

export interface HealthRouterDependencies {
  readonly checkReadiness: () => Promise<void>;
  readonly readMetrics?: () => HealthMetricsReading;
}

export function createHealthRouter(
  dependencies: HealthRouterDependencies,
): Router {
  const router = Router();

  router.get("/live", (_request, response) => {
    response.status(200).send({
      status: "ok",
      service: "api",
    });
  });

  router.get("/ready", async (_request, response) => {
    try {
      await dependencies.checkReadiness();
      response.status(200).send({
        status: "ready",
        dependencies: {
          database: "available",
        },
      });
    } catch {
      response.status(503).send({
        status: "not_ready",
        dependencies: {
          database: "unavailable",
        },
      });
    }
  });

  router.get("/metrics", (_request, response) => {
    if (!dependencies.readMetrics) {
      response.status(404).send({
        status: "not_configured",
      });
      return;
    }
    response.status(200).send(dependencies.readMetrics());
  });

  return router;
}
