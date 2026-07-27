import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(request, response) {
      const suppliedRequestId = request.headers["x-request-id"];
      const requestId =
        typeof suppliedRequestId === "string" &&
        suppliedRequestId.length > 0 &&
        suppliedRequestId.length <= 128
          ? suppliedRequestId
          : randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[REDACTED]",
    },
    customProps: (request) => ({
      correlationId: request.id,
    }),
  });
}
