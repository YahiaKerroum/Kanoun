import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type { KitchenWorkItemRecord } from "../domain/models.js";

export interface KitchenStore {
  createWorkForOrder(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly orderId: string;
      readonly orderReference: string;
      readonly tableId: string;
      readonly tableCode: string;
      readonly changeKind?: "new" | "corrected" | undefined;
      readonly correctionId?: string | undefined;
      readonly items: readonly {
        readonly id: string;
        readonly orderItemId: string;
        readonly name: string;
        readonly quantity: number;
        readonly selectedOptions: readonly {
          readonly optionGroupId: string;
          readonly optionGroupName: string;
          readonly optionId: string;
          readonly optionName: string;
        }[];
        readonly note?: string | undefined;
      }[];
      readonly now: Date;
    },
  ): Promise<void>;
  listQueue(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly branchId: string;
    },
  ): Promise<readonly KitchenWorkItemRecord[]>;
  getWorkItem(
    sql: SqlExecutor,
    businessAccountId: string,
    workItemId: string,
    lockForUpdate?: boolean,
  ): Promise<KitchenWorkItemRecord | undefined>;
  startItem(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly workItemId: string;
      readonly expectedVersion: number;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<KitchenWorkItemRecord | undefined>;
  markItemReady(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly workItemId: string;
      readonly expectedVersion: number;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<KitchenWorkItemRecord | undefined>;
  isOrderReady(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
  ): Promise<boolean>;
  cancelUnstartedForOrder(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly orderId: string;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<readonly KitchenWorkItemRecord[]>;
  reassignOrdersToTable(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly orderIds: readonly string[];
      readonly destinationTableId: string;
      readonly destinationTableCode: string;
      readonly now: Date;
    },
  ): Promise<void>;
}
