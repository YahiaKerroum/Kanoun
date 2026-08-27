import express, {
  type Express,
  type RequestHandler,
  type Router,
} from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { ServiceMetrics } from "@rms/building-blocks";
import {
  createUnexpectedErrorHandler,
  notFoundHandler,
} from "./middleware/errors.js";
import { createRequestMetrics } from "./middleware/metrics.js";
import { createRequestLogger } from "./middleware/request-logging.js";
import {
  createHealthRouter,
  type HealthMetricsReading,
} from "./platform-routes/health-router.js";

export interface AppDependencies {
  readonly logger: Logger;
  readonly trustProxy: false | number;
  readonly checkReadiness: () => Promise<void>;
  readonly staffSessionMiddleware?: RequestHandler;
  readonly guestSessionMiddleware?: RequestHandler;
  readonly apiRouters?: readonly Router[];
  readonly serviceMetrics?: ServiceMetrics;
  readonly readHealthMetrics?: () => HealthMetricsReading;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", dependencies.trustProxy);
  app.use(createRequestLogger(dependencies.logger));
  if (dependencies.serviceMetrics) {
    app.use(createRequestMetrics(dependencies.serviceMetrics));
  }
  app.use(helmet());
  app.use(express.json({ limit: "128kb" }));

  app.use(
    "/health",
    createHealthRouter({
      checkReadiness: dependencies.checkReadiness,
      ...(dependencies.readHealthMetrics
        ? { readMetrics: dependencies.readHealthMetrics }
        : {}),
    }),
  );

  if (dependencies.staffSessionMiddleware) {
    app.use("/api/v1", dependencies.staffSessionMiddleware);
  }
  if (dependencies.guestSessionMiddleware) {
    app.use("/api/v1", dependencies.guestSessionMiddleware);
  }
  for (const router of dependencies.apiRouters ?? []) {
    app.use("/api/v1", router);
  }

  app.use(notFoundHandler);
  app.use(createUnexpectedErrorHandler(dependencies.logger));

  return app;
}
