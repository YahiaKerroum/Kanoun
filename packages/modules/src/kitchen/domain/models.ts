export type KitchenWorkState = "queued" | "preparing" | "ready" | "cancelled";

export interface KitchenOptionSnapshot {
  readonly optionGroupId: string;
  readonly optionGroupName: string;
  readonly optionId: string;
  readonly optionName: string;
}

export interface KitchenWorkItemRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly orderReference: string;
  readonly tableId: string;
  readonly tableCode: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly selectedOptions: readonly KitchenOptionSnapshot[];
  readonly note?: string | undefined;
  readonly state: KitchenWorkState;
  readonly version: number;
  readonly queuedAtUtc: Date;
  readonly startedAtUtc?: Date | undefined;
  readonly startedByUserId?: string | undefined;
  readonly startedByEmployeeId?: string | undefined;
  readonly readyAtUtc?: Date | undefined;
  readonly readyByUserId?: string | undefined;
  readonly readyByEmployeeId?: string | undefined;
}
