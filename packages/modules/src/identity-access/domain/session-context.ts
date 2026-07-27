import type { PermissionKey } from "./permission-catalog.js";

export interface StaffRequestContext {
  readonly sessionId: string;
  readonly businessAccountId: string;
  readonly userId: string;
  readonly employeeId: string;
  readonly restaurantId: string;
  readonly activeBranchId?: string;
  readonly authorizedBranchIds: readonly string[];
  readonly grants: readonly {
    readonly permissionKey: PermissionKey;
    readonly restaurantId?: string;
    readonly branchId?: string;
  }[];
  readonly authenticatedAtUtc: Date;
  readonly expiresAtUtc: Date;
}

export function hasPermission(
  context: StaffRequestContext,
  permissionKey: PermissionKey,
  restaurantId: string,
  branchId?: string,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.permissionKey === permissionKey &&
      (!grant.restaurantId || grant.restaurantId === restaurantId) &&
      (!grant.branchId || grant.branchId === branchId),
  );
}
