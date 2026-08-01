import { Router, type Request } from "express";
import { z } from "zod";
import {
  createCsrfProtection,
  readRequestCookie,
  requireStaffSession,
  staffSessionCookieName,
  type SessionMiddlewareDependencies,
  type StaffRequest,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  NotificationGapWarning,
  NotificationInboxItem,
} from "../contracts/notification-store.js";
import {
  notificationGapQuerySchema,
  notificationListQuerySchema,
  notificationParametersSchema,
  notificationStateSchema,
} from "./schemas.js";

export interface NotificationsHttpUseCases {
  listInbox(
    context: StaffRequestContext,
    input: {
      readonly branchId?: string;
      readonly after?: Date;
      readonly afterId?: string;
      readonly limit: number;
    },
  ): Promise<readonly NotificationInboxItem[]>;
  resolveCursor(
    context: StaffRequestContext,
    notificationId: string,
    branchId?: string,
  ): Promise<{ readonly createdAtUtc: Date; readonly id: string } | undefined>;
  updateState(
    context: StaffRequestContext,
    notificationId: string,
    action: "read" | "acknowledge",
  ): Promise<NotificationInboxItem>;
  listGapWarnings(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly NotificationGapWarning[]>;
}

export interface NotificationsRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: NotificationsHttpUseCases;
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
  const value = (request as StaffRequest).staffContext;
  if (!value) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return value;
}

function present(item: NotificationInboxItem): object {
  return {
    id: item.id,
    eventId: item.eventId,
    restaurantId: item.restaurantId,
    branchId: item.branchId ?? null,
    type: item.notificationType,
    groupKey: item.groupKey,
    title: item.title,
    body: item.body,
    taskState: item.taskState,
    readAt: item.readAtUtc?.toISOString() ?? null,
    acknowledgedAt: item.acknowledgedAtUtc?.toISOString() ?? null,
    occurredAt: item.occurredAtUtc.toISOString(),
    expiresAt: item.expiresAtUtc.toISOString(),
  };
}

export function createNotificationsRouter(
  dependencies: NotificationsRouterDependencies,
): Router {
  const router = Router();
  const csrf = createCsrfProtection(dependencies);

  router.get(
    "/staff/notifications",
    requireStaffSession(),
    async (request, response) => {
      const input = parse(notificationListQuerySchema, request.query);
      const items = await dependencies.useCases.listInbox(context(request), {
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.after ? { after: input.after } : {}),
        limit: input.limit,
      });
      response.send({ items: items.map(present) });
    },
  );

  router.patch(
    "/staff/notifications/:notificationId",
    requireStaffSession(),
    csrf,
    async (request, response) => {
      const parameters = parse(notificationParametersSchema, request.params);
      const input = parse(notificationStateSchema, request.body);
      const item = await dependencies.useCases.updateState(
        context(request),
        parameters.notificationId,
        input.action,
      );
      response.send(present(item));
    },
  );

  router.get(
    "/staff/notification-gaps",
    requireStaffSession(),
    async (request, response) => {
      const input = parse(notificationGapQuerySchema, request.query);
      const items = await dependencies.useCases.listGapWarnings(
        context(request),
        input.branchId,
      );
      response.send({
        items: items.map((item) => ({
          ...item,
          branchId: item.branchId ?? null,
          attemptedAt: item.attemptedAtUtc.toISOString(),
          attemptedAtUtc: undefined,
        })),
      });
    },
  );

  router.get(
    "/staff/notification-events",
    requireStaffSession(),
    async (request, response) => {
      const connectedAtUtc = new Date();
      const input = parse(notificationListQuerySchema, request.query);
      const lastEventId = request.get("last-event-id");
      if (lastEventId) {
        parse(z.uuid(), lastEventId);
      }
      const originalContext = context(request);
      if (
        input.branchId &&
        !originalContext.authorizedBranchIds.includes(input.branchId)
      ) {
        throw new ApplicationError(
          "permission_denied",
          403,
          "Permission denied",
        );
      }
      const rawSessionToken = readRequestCookie(
        request.headers.cookie,
        staffSessionCookieName,
      );
      const recoveredCursor = lastEventId
        ? await dependencies.useCases.resolveCursor(
            originalContext,
            lastEventId,
            input.branchId,
          )
        : undefined;
      response.status(200);
      response.set({
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      });
      response.flushHeaders();
      response.write("retry: 2000\n\n");
      if (lastEventId && !recoveredCursor) {
        response.write("event: replay-gap\n");
        response.write('data: {"reload":true}\n\n');
      }
      let cursor =
        recoveredCursor?.createdAtUtc ?? input.after ?? connectedAtUtc;
      let cursorId =
        recoveredCursor?.id ?? "00000000-0000-0000-0000-000000000000";
      let closed = false;
      const poll = async () => {
        if (closed || response.writableEnded) return;
        const currentContext = rawSessionToken
          ? await dependencies.authenticateSession(rawSessionToken)
          : undefined;
        const branchAuthorizationEnded =
          input.branchId !== undefined &&
          currentContext?.authorizedBranchIds.includes(input.branchId) !== true;
        if (
          currentContext?.sessionId !== originalContext.sessionId ||
          currentContext.userId !== originalContext.userId ||
          branchAuthorizationEnded
        ) {
          response.write("event: session-ended\n");
          response.write('data: {"reload":true}\n\n');
          response.end();
          return;
        }
        const items = await dependencies.useCases.listInbox(currentContext, {
          ...(input.branchId ? { branchId: input.branchId } : {}),
          after: cursor,
          ...(cursorId ? { afterId: cursorId } : {}),
          limit: 100,
        });
        for (const item of items) {
          response.write(`id: ${item.id}\n`);
          response.write("event: notification\n");
          response.write(`data: ${JSON.stringify(present(item))}\n\n`);
          cursor = item.createdAtUtc;
          cursorId = item.id;
        }
        if (response.writableLength > 65_536) {
          response.end();
        } else if (items.length === 0) {
          response.write(": heartbeat\n\n");
        }
      };
      await poll();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const schedulePoll = () => {
        if (closed || response.writableEnded) return;
        timer = setTimeout(() => {
          void poll()
            .then(schedulePoll)
            .catch(() => response.end());
        }, 2_000);
      };
      schedulePoll();
      response.on("close", () => {
        closed = true;
        if (timer) clearTimeout(timer);
      });
    },
  );

  return router;
}
