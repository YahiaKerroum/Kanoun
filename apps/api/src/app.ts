import express, {
  type Express,
  type RequestHandler,
  type Router,
} from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import {
  createUnexpectedErrorHandler,
  notFoundHandler,
} from "./middleware/errors.js";
import { createRequestLogger } from "./middleware/request-logging.js";
import { createHealthRouter } from "./platform-routes/health-router.js";

export interface AppDependencies {
  readonly logger: Logger;
  readonly trustProxy: boolean;
  readonly checkReadiness: () => Promise<void>;
  readonly staffSessionMiddleware?: RequestHandler;
  readonly apiRouters?: readonly Router[];
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", dependencies.trustProxy);
  app.use(createRequestLogger(dependencies.logger));
  app.use(helmet());
  app.use(express.json({ limit: "128kb" }));

  app.use(
    "/health",
    createHealthRouter({
      checkReadiness: dependencies.checkReadiness,
    }),
  );

  if (dependencies.staffSessionMiddleware) {
    app.use("/api/v1", dependencies.staffSessionMiddleware);
  }
  for (const router of dependencies.apiRouters ?? []) {
    app.use("/api/v1", router);
  }

  app.use(notFoundHandler);
  app.use(createUnexpectedErrorHandler(dependencies.logger));

  return app;
}
