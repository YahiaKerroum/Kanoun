import { Router } from "express";

export interface HealthRouterDependencies {
  readonly checkReadiness: () => Promise<void>;
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

  return router;
}
