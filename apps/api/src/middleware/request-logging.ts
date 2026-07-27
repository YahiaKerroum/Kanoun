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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          suppliedRequestId,
        )
          ? suppliedRequestId
          : randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-bootstrap-secret",
        "req.headers.x-csrf-token",
        "req.body.password",
        "req.body.token",
      ],
      censor: "[REDACTED]",
    },
    customProps: (request) => ({
      correlationId: request.id,
    }),
  });
}
