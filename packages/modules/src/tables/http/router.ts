import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ApplicationError } from "../../shared/application-error.js";
import {
  createCsrfProtection,
  requireStaffSession,
  type StaffRequest,
  type StaffRequestContext,
  type SessionMiddlewareDependencies,
} from "../../identity-access/index.js";
import type { Table, TableQrCode } from "../domain/models.js";
import {
  branchParametersSchema,
  createTableSchema,
  expectedVersionSchema,
  qrCodeParametersSchema,
  revokeQrCodeSchema,
  tableParametersSchema,
  updateTableSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface IssuedQrCode {
  readonly qrCode: TableQrCode;
  readonly rawToken: string;
  readonly qrUrl: string;
}

export interface TablesHttpUseCases {
  listTables(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly Table[]>;
  createTable(
    context: StaffRequestContext,
    branchId: string,
    input: z.infer<typeof createTableSchema>,
    metadata: RequestMetadata,
  ): Promise<Table>;
  updateTable(
    context: StaffRequestContext,
    tableId: string,
    input: z.infer<typeof updateTableSchema> & {
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<Table>;
  issueTableQrCode(
    context: StaffRequestContext,
    tableId: string,
    metadata: RequestMetadata,
  ): Promise<IssuedQrCode>;
  issueBranchQrCode(
    context: StaffRequestContext,
    branchId: string,
    metadata: RequestMetadata,
  ): Promise<IssuedQrCode>;
  revokeQrCode(
    context: StaffRequestContext,
    qrCodeId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<TableQrCode>;
  listQrCodes(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly TableQrCode[]>;
}

export interface TablesRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: TablesHttpUseCases;
}

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

function parse<Input>(schema: z.ZodType<Input>, value: unknown): Input {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(
      "validation_error",
      422,
      "Request validation failed",
      z.prettifyError(result.error),
    );
  }
  return result.data;
}

function context(request: Request): StaffRequestContext {
  const staffContext = (request as StaffRequest).staffContext;
  if (!staffContext) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return staffContext;
}

export function createTablesRouter(
  dependencies: TablesRouterDependencies,
): Router {
  const router = Router();
  const requireCsrf = createCsrfProtection(dependencies);
  const criticalChangeLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.use("/staff", requireStaffSession());

  router.get("/staff/branches/:branchId/tables", async (request, response) => {
    const parameters = parse(branchParametersSchema, request.params);
    response.send({
      items: await dependencies.useCases.listTables(
        context(request),
        parameters.branchId,
      ),
    });
  });

  router.post(
    "/staff/branches/:branchId/tables",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      const input = parse(createTableSchema, request.body);
      response
        .status(201)
        .send(
          await dependencies.useCases.createTable(
            context(request),
            parameters.branchId,
            input,
            metadata(request),
          ),
        );
    },
  );

  router.patch(
    "/staff/tables/:tableId",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(tableParametersSchema, request.params);
      const input = parse(updateTableSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateTable(
          context(request),
          parameters.tableId,
          { ...input, expectedVersion },
          metadata(request),
        ),
      );
    },
  );

  router.post(
    "/staff/tables/:tableId/qr-codes",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(tableParametersSchema, request.params);
      response
        .status(201)
        .send(
          await dependencies.useCases.issueTableQrCode(
            context(request),
            parameters.tableId,
            metadata(request),
          ),
        );
    },
  );

  router.post(
    "/staff/branches/:branchId/qr-codes",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      response
        .status(201)
        .send(
          await dependencies.useCases.issueBranchQrCode(
            context(request),
            parameters.branchId,
            metadata(request),
          ),
        );
    },
  );

  router.post(
    "/staff/qr-codes/:qrCodeId/revocations",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(qrCodeParametersSchema, request.params);
      const input = parse(revokeQrCodeSchema, request.body);
      response.send(
        await dependencies.useCases.revokeQrCode(
          context(request),
          parameters.qrCodeId,
          input.reason,
          metadata(request),
        ),
      );
    },
  );

  router.get(
    "/staff/branches/:branchId/qr-codes",
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      response.send({
        items: await dependencies.useCases.listQrCodes(
          context(request),
          parameters.branchId,
        ),
      });
    },
  );

  return router;
}
