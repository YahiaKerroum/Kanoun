import express, { type Express } from "express";
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

  app.use(notFoundHandler);
  app.use(createUnexpectedErrorHandler(dependencies.logger));

  return app;
}
