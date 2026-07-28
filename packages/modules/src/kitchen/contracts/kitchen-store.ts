import type { TransactionContext } from "@rms/building-blocks";

export interface KitchenStore {
  createWorkForOrder(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly orderId: string;
      readonly orderReference: string;
      readonly items: readonly {
        readonly id: string;
        readonly orderItemId: string;
        readonly name: string;
        readonly quantity: number;
        readonly note?: string | undefined;
      }[];
      readonly now: Date;
    },
  ): Promise<void>;
}
