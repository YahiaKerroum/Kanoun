export interface GuestSessionRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly createdAtUtc: Date;
  readonly lastSeenAtUtc: Date;
  readonly expiresAtUtc: Date;
  readonly revokedAtUtc?: Date | undefined;
}
