import type {
  Money,
  SqlExecutor,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  CancellationRequestRecord,
  GuestSessionRecord,
  OrderApprovalState,
  OrderClosureState,
  OrderFulfilmentState,
  OrderRecord,
} from "../domain/models.js";
import type { ResolvedOrderItemSnapshot } from "../../menu/index.js";

export interface CreateGuestSessionInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly displayName?: string | undefined;
  readonly now: Date;
  readonly absoluteExpiresAtUtc: Date;
}

export interface OrderingStore {
  createGuestSession(
    transaction: TransactionContext,
    input: CreateGuestSessionInput,
  ): Promise<GuestSessionRecord>;
  findGuestSessionByTokenHash(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<GuestSessionRecord | undefined>;
  getGuestSession(
    sql: SqlExecutor,
    businessAccountId: string,
    guestSessionId: string,
  ): Promise<GuestSessionRecord | undefined>;
  touchGuestSession(sql: SqlExecutor, id: string, now: Date): Promise<void>;
  bindGuestSessionToTableSession(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly guestSessionId: string;
      readonly tableSessionId: string;
      readonly displayName?: string | undefined;
    },
  ): Promise<boolean>;
  createOrder(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId: string;
      readonly tableSessionId: string;
      readonly creatorType: "guest" | "staff";
      readonly customerSessionId?: string | undefined;
      readonly createdByUserId?: string | undefined;
      readonly createdByEmployeeId?: string | undefined;
      readonly customerDisplayName?: string | undefined;
      readonly configurationVersionId: string;
      readonly configurationVersion: number;
      readonly total: Money;
      readonly items: readonly (ResolvedOrderItemSnapshot & {
        readonly id: string;
      })[];
      readonly now: Date;
    },
  ): Promise<OrderRecord>;
  getGuestOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    guestSessionId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined>;
  getOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined>;
  getOrderForUpdate(
    transaction: TransactionContext,
    businessAccountId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined>;
  transitionFulfilment(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly orderId: string;
      readonly from: "not_started" | "preparing";
      readonly to: "preparing" | "ready";
      readonly now: Date;
    },
  ): Promise<OrderRecord | undefined>;
  markServed(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly orderId: string;
      readonly expectedVersion: number;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<OrderRecord | undefined>;
  listStaffOrders(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly approval?: OrderApprovalState | undefined;
      readonly fulfilment?: OrderFulfilmentState | undefined;
      readonly closure?: OrderClosureState | undefined;
      readonly tableId?: string | undefined;
      readonly createdByEmployeeId?: string | undefined;
      readonly submittedFromUtc?: Date | undefined;
      readonly submittedToUtc?: Date | undefined;
      readonly pageSize: number;
      readonly beforeSubmittedAtUtc?: Date | undefined;
      readonly beforeOrderId?: string | undefined;
    },
  ): Promise<readonly OrderRecord[]>;
  createCancellationRequest(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly orderId: string;
      readonly customerSessionId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<CancellationRequestRecord>;
}
