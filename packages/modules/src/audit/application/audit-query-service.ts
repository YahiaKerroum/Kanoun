import type { DatabasePool } from "@rms/building-blocks";
import {
  hasPermission,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  AuditEventRecord,
  AuditReader,
} from "../contracts/audit-reader.js";

export interface AuditSearchInput {
  readonly restaurantId?: string;
  readonly branchId?: string;
  readonly actorUserId?: string;
  readonly action?: string;
  readonly targetType?: string;
  readonly occurredFrom?: Date;
  readonly occurredTo?: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditQueryServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly reader: AuditReader;
}

export class AuditQueryService {
  public constructor(
    private readonly dependencies: AuditQueryServiceDependencies,
  ) {}

  public async search(
    context: StaffRequestContext,
    input: AuditSearchInput,
  ): Promise<{
    readonly items: readonly AuditEventRecord[];
    readonly page: number;
    readonly hasMore: boolean;
  }> {
    const hasTenantWideAudit = context.grants.some(
      (grant) =>
        grant.permissionKey === "audit.view" &&
        grant.restaurantId === undefined &&
        grant.branchId === undefined,
    );
    if (
      input.restaurantId
        ? !hasPermission(context, "audit.view", input.restaurantId)
        : !hasTenantWideAudit
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    if (
      input.branchId &&
      !context.authorizedBranchIds.includes(input.branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const rows = await this.dependencies.reader.search(
      this.dependencies.databasePool,
      {
        businessAccountId: context.businessAccountId,
        ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
        authorizedBranchIds: context.authorizedBranchIds,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.targetType ? { targetType: input.targetType } : {}),
        ...(input.occurredFrom ? { occurredFrom: input.occurredFrom } : {}),
        ...(input.occurredTo ? { occurredTo: input.occurredTo } : {}),
        limit: input.pageSize + 1,
        offset: input.page * input.pageSize,
      },
    );
    return {
      items: rows.slice(0, input.pageSize),
      page: input.page,
      hasMore: rows.length > input.pageSize,
    };
  }
}
