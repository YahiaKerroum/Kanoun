import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: "resource_not_found" | "unexpected_error";
  readonly correlationId: string;
}

function getRequestId(requestId: unknown): string {
  return typeof requestId === "string" || typeof requestId === "number"
    ? String(requestId)
    : "unknown";
}

export const notFoundHandler: RequestHandler = (request, response) => {
  const problem: ProblemDetails = {
    type: "/problems/resource-not-found",
    title: "Resource not found",
    status: 404,
    code: "resource_not_found",
    correlationId: getRequestId(request.id),
  };

  response
    .status(problem.status)
    .type("application/problem+json")
    .send(problem);
};

export function createUnexpectedErrorHandler(
  logger: Logger,
): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    void next;
    logger.error(
      {
        error,
        correlationId: request.id,
        method: request.method,
        path: request.path,
      },
      "Unexpected request failure",
    );

    const problem: ProblemDetails = {
      type: "/problems/unexpected-error",
      title: "The request could not be completed",
      status: 500,
      code: "unexpected_error",
      correlationId: getRequestId(request.id),
    };

    response
      .status(problem.status)
      .type("application/problem+json")
      .send(problem);
  };
}
