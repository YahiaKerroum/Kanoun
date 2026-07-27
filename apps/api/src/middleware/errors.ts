import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { ApplicationError, type ApplicationErrorCode } from "@rms/modules";

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ApplicationErrorCode | "unexpected_error";
  readonly correlationId: string;
  readonly detail?: string;
  readonly currentVersion?: number;
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
    if (error instanceof ApplicationError) {
      const problem: ProblemDetails = {
        type: `/problems/${error.code.replaceAll("_", "-")}`,
        title: error.title,
        status: error.status,
        code: error.code,
        correlationId: getRequestId(request.id),
        ...(error.detail ? { detail: error.detail } : {}),
        ...(error.currentVersion !== undefined
          ? { currentVersion: error.currentVersion }
          : {}),
      };
      response
        .status(problem.status)
        .type("application/problem+json")
        .send(problem);
      return;
    }

    const databaseCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (databaseCode === "23505") {
      const problem: ProblemDetails = {
        type: "/problems/concurrency-conflict",
        title: "The requested value is already in use",
        status: 409,
        code: "concurrency_conflict",
        correlationId: getRequestId(request.id),
      };
      response
        .status(problem.status)
        .type("application/problem+json")
        .send(problem);
      return;
    }
    if (
      databaseCode === "23503" ||
      databaseCode === "23514" ||
      databaseCode === "22P02"
    ) {
      const problem: ProblemDetails = {
        type: "/problems/validation-error",
        title: "Request validation failed",
        status: 422,
        code: "validation_error",
        correlationId: getRequestId(request.id),
      };
      response
        .status(problem.status)
        .type("application/problem+json")
        .send(problem);
      return;
    }

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
