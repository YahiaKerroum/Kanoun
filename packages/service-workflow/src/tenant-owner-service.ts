import { randomUUID } from "node:crypto";
import type { DatabasePool, TransactionContext } from "@rms/building-blocks";
import { appendOutboxMessage } from "@rms/building-blocks";
import {
  administratorPermissionKeys,
  ApplicationError,
  featureDefinitionById,
  featureDefinitions,
  hasPermission,
  permissionDefinitionByKey,
  type Address,
  type AuditWriter,
  type BranchRecord,
  type ContactInformation,
  type EmployeeReference,
  type FeatureConfiguration,
  type FeatureState,
  type IdentityAccessStore,
  type IdentitySecurity,
  type OpeningPeriod,
  type OrderingStore,
  type PermissionGrant,
  type PermissionKey,
  type PermissionSet,
  type PermissionTemplate,
  type PermissionTemplateKey,
  type RestaurantConfigurationStore,
  type RestaurantRecord,
  type StaffSessionProfile,
  type StaffRequestContext,
  type SupportTenantSnapshot,
  type TablesStore,
} from "@rms/modules";
import type { PostgresServiceWorkflow } from "./postgres-service-workflow.js";

export interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
  readonly now?: Date;
}

export interface TenantBootstrapInput {
  readonly businessCode: string;
  readonly businessName: string;
  readonly restaurantName: string;
  readonly branch: {
    readonly name: string;
    readonly address: Address;
    readonly contact: ContactInformation;
    readonly timeZone: string;
    readonly currency: string;
    readonly openingHours: readonly OpeningPeriod[];
  };
  readonly owner: {
    readonly displayName: string;
    readonly email: string;
    readonly password: string;
  };
}

export interface TenantBootstrapResult {
  readonly businessAccountId: string;
  readonly restaurant: RestaurantRecord;
  readonly branch: BranchRecord;
  readonly employeeId: string;
  readonly userId: string;
}

export interface LoginResult {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly context: StaffRequestContext;
}

export interface CredentialTokenDelivery {
  deliverRecoveryToken(input: {
    readonly businessCode: string;
    readonly email: string;
    readonly token: string;
    readonly expiresAtUtc: Date;
  }): Promise<void>;
}

export interface SupportAccessInput {
  readonly businessAccountId: string;
  readonly operatorId: string;
  readonly approverId: string;
  readonly approvalReference: string;
  readonly reason: string;
  readonly permissionKeys: readonly PermissionKey[];
  readonly restaurantIds: readonly string[];
  readonly branchIds: readonly string[];
  readonly expiresAtUtc: Date;
}

export interface TenantOwnerServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly identityAccess: IdentityAccessStore;
  readonly identitySecurity: IdentitySecurity;
  readonly audit: AuditWriter;
  readonly credentialTokenDelivery: CredentialTokenDelivery;
  readonly ordering: OrderingStore;
  readonly tables: TablesStore;
}

function nowFrom(metadata: RequestMetadata): Date {
  return metadata.now ?? new Date();
}

function requirePermission(
  context: StaffRequestContext,
  permission: Parameters<typeof hasPermission>[1],
  restaurantId: string,
  branchId?: string,
): void {
  if (!hasPermission(context, permission, restaurantId, branchId)) {
    throw new ApplicationError("permission_denied", 403, "Permission denied");
  }
}

function requireTenantWidePermission(
  context: StaffRequestContext,
  permission: Parameters<typeof hasPermission>[1],
): void {
  const granted = context.grants.some(
    (grant) =>
      grant.permissionKey === permission &&
      grant.restaurantId === undefined &&
      grant.branchId === undefined,
  );
  if (!granted) {
    throw new ApplicationError("permission_denied", 403, "Permission denied");
  }
}

function requireRecentAuthentication(
  context: StaffRequestContext,
  now: Date,
): void {
  if (now.getTime() - context.authenticatedAtUtc.getTime() > 15 * 60_000) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Recent authentication required",
      "Sign in again before changing administrator access.",
    );
  }
}

function grantIdentity(grant: PermissionGrant): string {
  return [
    grant.permissionKey,
    grant.restaurantId ?? "*",
    grant.branchId ?? "*",
  ].join(":");
}

function uniqueGrants(grants: readonly PermissionGrant[]): PermissionGrant[] {
  return [
    ...new Map(grants.map((grant) => [grantIdentity(grant), grant])).values(),
  ];
}

function uniqueValues<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

function grantsContainAdministrator(
  grants: readonly PermissionGrant[],
): boolean {
  return administratorPermissionKeys.every((permissionKey) =>
    grants.some((grant) => grant.permissionKey === permissionKey),
  );
}

function assertOpeningHoursDoNotOverlap(
  openingHours: readonly OpeningPeriod[],
): void {
  const expandedByDay = new Map<number, { start: number; end: number }[]>();
  const minute = (value: string): number => {
    const [hours = "0", minutes = "0"] = value.split(":");
    return Number(hours) * 60 + Number(minutes);
  };

  for (const period of openingHours) {
    const start = minute(period.opensAt);
    let end = minute(period.closesAt);
    if (end <= start) {
      end += 24 * 60;
    }
    const periods = expandedByDay.get(period.dayOfWeek) ?? [];
    if (
      periods.some((existing) => start < existing.end && end > existing.start)
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Opening hours overlap",
      );
    }
    periods.push({ start, end });
    expandedByDay.set(period.dayOfWeek, periods);
  }
}

export class TenantOwnerService {
  public constructor(
    private readonly dependencies: TenantOwnerServiceDependencies,
  ) {}

  public async bootstrapTenant(
    input: TenantBootstrapInput,
    metadata: RequestMetadata,
  ): Promise<TenantBootstrapResult> {
    assertOpeningHoursDoNotOverlap(input.branch.openingHours);
    const now = nowFrom(metadata);
    const ids = {
      businessAccountId: randomUUID(),
      restaurantId: randomUUID(),
      branchId: randomUUID(),
      employeeId: randomUUID(),
      userId: randomUUID(),
    };
    const passwordHash = await this.dependencies.identitySecurity.hashPassword(
      input.owner.password,
    );

    return this.dependencies.workflow.run(async (transaction) => {
      await this.dependencies.restaurantConfiguration.createBusinessAccount(
        transaction,
        {
          id: ids.businessAccountId,
          code: input.businessCode,
          name: input.businessName,
          now,
        },
      );
      const restaurant =
        await this.dependencies.restaurantConfiguration.createRestaurant(
          transaction,
          {
            id: ids.restaurantId,
            businessAccountId: ids.businessAccountId,
            name: input.restaurantName,
            now,
          },
        );
      const branch =
        await this.dependencies.restaurantConfiguration.createBranch(
          transaction,
          {
            id: ids.branchId,
            businessAccountId: ids.businessAccountId,
            restaurantId: ids.restaurantId,
            name: input.branch.name,
            address: input.branch.address,
            contact: input.branch.contact,
            timeZone: input.branch.timeZone,
            currency: input.branch.currency,
            serviceStatus: "closed",
            allowOrderOverride: false,
            openingHours: input.branch.openingHours,
            now,
          },
        );
      await this.dependencies.restaurantConfiguration.createEmployee(
        transaction,
        {
          id: ids.employeeId,
          businessAccountId: ids.businessAccountId,
          restaurantId: ids.restaurantId,
          displayName: input.owner.displayName,
          email: input.owner.email,
          branchIds: [ids.branchId],
          now,
        },
      );
      await this.dependencies.identityAccess.createOwnerIdentity(transaction, {
        userId: ids.userId,
        businessAccountId: ids.businessAccountId,
        employeeId: ids.employeeId,
        emailNormalized: this.dependencies.identitySecurity.normalizeEmail(
          input.owner.email,
        ),
        passwordHash,
        permissionKeys: administratorPermissionKeys,
        now,
      });
      await this.appendAudit(transaction, {
        businessAccountId: ids.businessAccountId,
        restaurantId: ids.restaurantId,
        branchId: ids.branchId,
        actorUserId: ids.userId,
        action: "identity.owner_bootstrapped",
        targetType: "business_account",
        targetId: ids.businessAccountId,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        afterData: {
          restaurantId: ids.restaurantId,
          branchId: ids.branchId,
          ownerEmployeeId: ids.employeeId,
        },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.owner_bootstrapped.v1",
        businessAccountId: ids.businessAccountId,
        restaurantId: ids.restaurantId,
        branchId: ids.branchId,
        aggregateId: ids.businessAccountId,
        aggregateVersion: 1,
        actorId: ids.userId,
        payload: {
          restaurant_id: ids.restaurantId,
          branch_id: ids.branchId,
          owner_employee_id: ids.employeeId,
        },
        metadata,
        now,
      });

      return {
        businessAccountId: ids.businessAccountId,
        restaurant,
        branch,
        employeeId: ids.employeeId,
        userId: ids.userId,
      };
    });
  }

  public async login(
    input: {
      readonly businessCode: string;
      readonly email: string;
      readonly password: string;
    },
    metadata: RequestMetadata,
  ): Promise<LoginResult> {
    const now = nowFrom(metadata);
    const credentials =
      await this.dependencies.identityAccess.findCredentialsForLogin(
        this.dependencies.databasePool,
        input.businessCode,
        this.dependencies.identitySecurity.normalizeEmail(input.email),
      );
    const passwordValid =
      await this.dependencies.identitySecurity.verifyPassword(
        input.password,
        credentials?.passwordHash,
      );
    if (credentials?.status !== "active" || !passwordValid) {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Authentication failed",
        "The supplied credentials could not be verified.",
      );
    }

    const branches =
      await this.dependencies.restaurantConfiguration.listAssignedBranches(
        this.dependencies.databasePool,
        credentials.businessAccountId,
        credentials.employeeId,
      );
    const session = this.dependencies.identitySecurity.createToken();
    const csrf = this.dependencies.identitySecurity.createToken();
    const sessionId = randomUUID();
    const expiresAtUtc = new Date(now.getTime() + 12 * 60 * 60_000);

    await this.dependencies.workflow.run((transaction) =>
      this.dependencies.identityAccess.createSession(transaction, {
        id: sessionId,
        businessAccountId: credentials.businessAccountId,
        userId: credentials.id,
        tokenHash: session.hash,
        csrfTokenHash: csrf.hash,
        ...(branches[0] ? { activeBranchId: branches[0].id } : {}),
        credentialVersion: credentials.credentialVersion,
        now,
        expiresAtUtc,
      }),
    );
    const context = await this.dependencies.identityAccess.getSessionContext(
      this.dependencies.databasePool,
      session.hash,
      now,
    );
    if (!context) {
      throw new Error("The newly created session could not be resolved.");
    }

    return {
      sessionToken: session.raw,
      csrfToken: csrf.raw,
      context,
    };
  }

  public async getSessionProfile(
    context: StaffRequestContext,
  ): Promise<StaffSessionProfile> {
    const employee =
      await this.dependencies.restaurantConfiguration.getEmployee(
        this.dependencies.databasePool,
        context.businessAccountId,
        context.employeeId,
      );
    if (employee?.status !== "active") {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Authentication required",
      );
    }
    if (employee.restaurantId !== context.restaurantId) {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Authentication required",
      );
    }

    const restaurant =
      await this.dependencies.restaurantConfiguration.getRestaurant(
        this.dependencies.databasePool,
        employee.businessAccountId,
        employee.restaurantId,
      );
    const activeBranch = context.activeBranchId
      ? await this.dependencies.restaurantConfiguration.getBranch(
          this.dependencies.databasePool,
          employee.businessAccountId,
          context.activeBranchId,
        )
      : undefined;
    if (!restaurant) {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Authentication required",
      );
    }
    if (
      context.activeBranchId !== undefined &&
      (activeBranch?.restaurantId !== employee.restaurantId ||
        !context.authorizedBranchIds.includes(activeBranch.id))
    ) {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Authentication required",
      );
    }

    return {
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        email: employee.email,
      },
      restaurant: { id: restaurant.id, name: restaurant.name },
      activeBranch: activeBranch
        ? { id: activeBranch.id, name: activeBranch.name }
        : null,
    };
  }

  public authenticateSession(
    rawSessionToken: string,
    now = new Date(),
  ): Promise<
    (StaffRequestContext & { readonly csrfTokenHash: string }) | undefined
  > {
    return this.dependencies.identityAccess.getSessionContext(
      this.dependencies.databasePool,
      this.dependencies.identitySecurity.hashToken(rawSessionToken),
      now,
    );
  }

  public async logout(
    context: StaffRequestContext,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    await this.dependencies.workflow.run(async (transaction) => {
      await this.dependencies.identityAccess.revokeSession(
        transaction,
        context.businessAccountId,
        context.sessionId,
        "logout",
        now,
      );
      await this.appendEvent(transaction, {
        eventType: "identity.session_revoked.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: context.restaurantId,
        ...(context.activeBranchId ? { branchId: context.activeBranchId } : {}),
        aggregateId: context.sessionId,
        aggregateVersion: 1,
        actorId: context.userId,
        payload: { reason: "logout" },
        metadata,
        now,
      });
    });
  }

  public async switchBranch(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<void> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
    const switched = await this.dependencies.workflow.run((transaction) =>
      this.dependencies.identityAccess.switchActiveBranch(
        transaction,
        context,
        branchId,
      ),
    );
    if (!switched) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
  }

  public async listRestaurants(
    context: StaffRequestContext,
  ): Promise<readonly RestaurantRecord[]> {
    const restaurants =
      await this.dependencies.restaurantConfiguration.listRestaurants(
        this.dependencies.databasePool,
        context.businessAccountId,
      );
    if (
      !context.grants.some((grant) => grant.permissionKey === "restaurant.view")
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return restaurants.filter((restaurant) =>
      hasPermission(context, "restaurant.view", restaurant.id),
    );
  }

  public async getRestaurant(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<RestaurantRecord> {
    requirePermission(context, "restaurant.view", restaurantId);
    const restaurant =
      await this.dependencies.restaurantConfiguration.getRestaurant(
        this.dependencies.databasePool,
        context.businessAccountId,
        restaurantId,
      );
    if (!restaurant) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Restaurant not found",
      );
    }
    return restaurant;
  }

  public async createRestaurant(
    context: StaffRequestContext,
    input: {
      readonly name: string;
      readonly branding?: Readonly<Record<string, unknown>> | undefined;
      readonly settings?: Readonly<Record<string, unknown>> | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<RestaurantRecord> {
    requireTenantWidePermission(context, "restaurant.edit");
    const now = nowFrom(metadata);
    const restaurantId = randomUUID();
    return this.dependencies.workflow.run(async (transaction) => {
      const restaurant =
        await this.dependencies.restaurantConfiguration.createRestaurant(
          transaction,
          {
            id: restaurantId,
            businessAccountId: context.businessAccountId,
            name: input.name,
            ...(input.branding ? { branding: input.branding } : {}),
            ...(input.settings ? { settings: input.settings } : {}),
            now,
          },
        );
      await this.auditAndEventForConfigurationChange(transaction, {
        action: "restaurant.created",
        eventType: "restaurant.restaurant_created.v1",
        context,
        targetType: "restaurant",
        targetId: restaurant.id,
        restaurantId: restaurant.id,
        aggregateVersion: restaurant.version,
        afterData: restaurant,
        metadata,
        now,
      });
      return restaurant;
    });
  }

  public async updateRestaurant(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly expectedVersion: number;
      readonly name?: string | undefined;
      readonly status?: RestaurantRecord["status"] | undefined;
      readonly branding?: Readonly<Record<string, unknown>> | undefined;
      readonly settings?: Readonly<Record<string, unknown>> | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<RestaurantRecord> {
    requirePermission(context, "restaurant.edit", input.restaurantId);
    const before = await this.getRestaurant(context, input.restaurantId);
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const restaurant =
        await this.dependencies.restaurantConfiguration.updateRestaurant(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            restaurantId: input.restaurantId,
            expectedVersion: input.expectedVersion,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.branding !== undefined
              ? { branding: input.branding }
              : {}),
            ...(input.settings !== undefined
              ? { settings: input.settings }
              : {}),
            now,
          },
        );
      if (!restaurant) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Restaurant changed",
          "Reload the restaurant and retry the change.",
          before.version,
        );
      }
      await this.auditAndEventForConfigurationChange(transaction, {
        action:
          restaurant.status === "inactive"
            ? "restaurant.deactivated"
            : "restaurant.updated",
        eventType: "restaurant.restaurant_updated.v1",
        context,
        targetType: "restaurant",
        targetId: restaurant.id,
        restaurantId: restaurant.id,
        aggregateVersion: restaurant.version,
        beforeData: before,
        afterData: restaurant,
        metadata,
        now,
      });
      return restaurant;
    });
  }

  public async listBranches(
    context: StaffRequestContext,
  ): Promise<readonly BranchRecord[]> {
    if (
      !context.grants.some((grant) => grant.permissionKey === "branches.view")
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branches =
      await this.dependencies.restaurantConfiguration.listAssignedBranches(
        this.dependencies.databasePool,
        context.businessAccountId,
        context.employeeId,
      );
    return branches.filter((branch) =>
      hasPermission(context, "branches.view", branch.restaurantId, branch.id),
    );
  }

  public async getBranch(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<BranchRecord> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (!branch) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
    requirePermission(context, "branches.view", branch.restaurantId, branch.id);
    return branch;
  }

  public async createBranch(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly name: string;
      readonly address: Address;
      readonly contact: ContactInformation;
      readonly timeZone: string;
      readonly currency: string;
      readonly openingHours: readonly OpeningPeriod[];
    },
    metadata: RequestMetadata,
  ): Promise<BranchRecord> {
    requirePermission(context, "branches.manage", input.restaurantId);
    assertOpeningHoursDoNotOverlap(input.openingHours);
    const restaurant =
      await this.dependencies.restaurantConfiguration.getRestaurant(
        this.dependencies.databasePool,
        context.businessAccountId,
        input.restaurantId,
      );
    if (!restaurant) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Restaurant not found",
      );
    }
    const now = nowFrom(metadata);
    const branchId = randomUUID();
    return this.dependencies.workflow.run(async (transaction) => {
      const branch =
        await this.dependencies.restaurantConfiguration.createBranch(
          transaction,
          {
            id: branchId,
            businessAccountId: context.businessAccountId,
            restaurantId: input.restaurantId,
            name: input.name,
            address: input.address,
            contact: input.contact,
            timeZone: input.timeZone,
            currency: input.currency,
            serviceStatus: "closed",
            allowOrderOverride: false,
            openingHours: input.openingHours,
            now,
          },
        );
      await this.dependencies.restaurantConfiguration.grantEmployeeBranchAccess(
        transaction,
        context.businessAccountId,
        context.employeeId,
        branch.id,
        now,
      );
      await this.auditAndEventForConfigurationChange(transaction, {
        action: "branch.created",
        eventType: "restaurant.branch_created.v1",
        context,
        targetType: "branch",
        targetId: branch.id,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        aggregateVersion: branch.version,
        afterData: branch,
        metadata,
        now,
      });
      return branch;
    });
  }

  public async updateBranch(
    context: StaffRequestContext,
    input: {
      readonly branchId: string;
      readonly expectedVersion: number;
      readonly name?: string | undefined;
      readonly address?: Address | undefined;
      readonly contact?: ContactInformation | undefined;
      readonly timeZone?: string | undefined;
      readonly currency?: string | undefined;
      readonly status?: BranchRecord["status"] | undefined;
      readonly serviceStatus?: BranchRecord["serviceStatus"] | undefined;
      readonly allowOrderOverride?: boolean | undefined;
      readonly openingHours?: readonly OpeningPeriod[] | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<BranchRecord> {
    const before = await this.getBranch(context, input.branchId);
    requirePermission(
      context,
      "branches.manage",
      before.restaurantId,
      before.id,
    );
    if (input.openingHours) {
      assertOpeningHoursDoNotOverlap(input.openingHours);
    }
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const lockedBranch =
        await this.dependencies.restaurantConfiguration.lockBranchLifecycle(
          transaction,
          context.businessAccountId,
          input.branchId,
        );
      if (
        lockedBranch?.version === input.expectedVersion &&
        lockedBranch.status === "active" &&
        input.status === "inactive"
      ) {
        const [hasActiveOrders, hasOpenSessions] = await Promise.all([
          this.dependencies.ordering.branchHasActiveOrders(
            transaction.sql,
            context.businessAccountId,
            before.id,
          ),
          this.dependencies.tables.branchHasOpenTableSessions(
            transaction.sql,
            context.businessAccountId,
            before.id,
          ),
        ]);
        if (hasActiveOrders || hasOpenSessions) {
          throw new ApplicationError(
            "invalid_state_transition",
            409,
            "Branch has active work",
            "Complete or cancel active orders and close table sessions before deactivating this branch.",
            before.version,
          );
        }
      }
      const branch =
        await this.dependencies.restaurantConfiguration.updateBranch(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            branchId: input.branchId,
            expectedVersion: input.expectedVersion,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.contact !== undefined ? { contact: input.contact } : {}),
            ...(input.timeZone !== undefined
              ? { timeZone: input.timeZone }
              : {}),
            ...(input.currency !== undefined
              ? { currency: input.currency }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.serviceStatus !== undefined
              ? { serviceStatus: input.serviceStatus }
              : {}),
            ...(input.allowOrderOverride !== undefined
              ? { allowOrderOverride: input.allowOrderOverride }
              : {}),
            ...(input.openingHours !== undefined
              ? { openingHours: input.openingHours }
              : {}),
            now,
          },
        );
      if (!branch) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Branch changed",
          "Reload the branch and retry the change.",
          before.version,
        );
      }
      await this.auditAndEventForConfigurationChange(transaction, {
        action:
          branch.status === "inactive"
            ? "branch.deactivated"
            : "branch.updated",
        eventType: "restaurant.branch_updated.v1",
        context,
        targetType: "branch",
        targetId: branch.id,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        aggregateVersion: branch.version,
        beforeData: before,
        afterData: branch,
        metadata,
        now,
      });
      return branch;
    });
  }

  public async listEmployees(
    context: StaffRequestContext,
    restaurantId: string,
  ) {
    requirePermission(context, "employees.view", restaurantId);
    return this.dependencies.restaurantConfiguration.listEmployees(
      this.dependencies.databasePool,
      context.businessAccountId,
      restaurantId,
    );
  }

  public async getEmployee(context: StaffRequestContext, employeeId: string) {
    const employee =
      await this.dependencies.restaurantConfiguration.getEmployee(
        this.dependencies.databasePool,
        context.businessAccountId,
        employeeId,
      );
    if (!employee) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Employee not found",
      );
    }
    requirePermission(context, "employees.view", employee.restaurantId);
    return employee;
  }

  public async createEmployee(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly displayName: string;
      readonly email: string;
      readonly branchIds: readonly string[];
    },
    metadata: RequestMetadata,
  ) {
    requirePermission(context, "employees.manage", input.restaurantId);
    await this.validateDelegableBranches(
      context,
      input.restaurantId,
      input.branchIds,
    );
    const now = nowFrom(metadata);
    const employeeId = randomUUID();
    return this.dependencies.workflow.run(async (transaction) => {
      const employee =
        await this.dependencies.restaurantConfiguration.createEmployee(
          transaction,
          {
            id: employeeId,
            businessAccountId: context.businessAccountId,
            restaurantId: input.restaurantId,
            displayName: input.displayName,
            email: input.email,
            branchIds: input.branchIds,
            now,
          },
        );
      await this.dependencies.identityAccess.initializePermissionSet(
        transaction,
        context.businessAccountId,
        employee.id,
        now,
      );
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action: "employee.created",
        targetType: "employee",
        targetId: employee.id,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        afterData: employee,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "restaurant.employee_created.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: employee.id,
        aggregateVersion: employee.version,
        actorId: context.userId,
        payload: { branch_ids: [...employee.branchIds] },
        metadata,
        now,
      });
      return employee;
    });
  }

  public async updateEmployeeProfile(
    context: StaffRequestContext,
    input: {
      readonly employeeId: string;
      readonly expectedVersion: number;
      readonly displayName?: string;
      readonly email?: string;
      readonly status?: "active";
    },
    metadata: RequestMetadata,
  ) {
    const before = await this.getEmployee(context, input.employeeId);
    requirePermission(context, "employees.manage", before.restaurantId);
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const employee =
        await this.dependencies.restaurantConfiguration.updateEmployee(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            employeeId: input.employeeId,
            expectedVersion: input.expectedVersion,
            ...(input.displayName !== undefined
              ? { displayName: input.displayName }
              : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            now,
          },
        );
      if (!employee) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Employee changed",
          "Reload the employee and retry the change.",
          before.version,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action:
          before.status === "inactive" && employee.status === "active"
            ? "employee.activated"
            : "employee.updated",
        targetType: "employee",
        targetId: employee.id,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        beforeData: before,
        afterData: employee,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "restaurant.employee_updated.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: employee.id,
        aggregateVersion: employee.version,
        actorId: context.userId,
        payload: { status: employee.status },
        metadata,
        now,
      });
      return employee;
    });
  }

  public async replaceEmployeeBranches(
    context: StaffRequestContext,
    employeeId: string,
    expectedVersion: number,
    branchIds: readonly string[],
    reason: string,
    metadata: RequestMetadata,
  ) {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);
    const before = await this.getEmployee(context, employeeId);
    requirePermission(context, "employees.manage", before.restaurantId);
    await this.validateDelegableBranches(
      context,
      before.restaurantId,
      branchIds,
    );

    return this.dependencies.workflow.run(async (transaction) => {
      const permissionSet =
        await this.dependencies.identityAccess.getPermissionSet(
          transaction.sql,
          context.businessAccountId,
          employeeId,
        );
      const employee =
        await this.dependencies.restaurantConfiguration.replaceEmployeeBranchAccess(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            employeeId,
            expectedVersion,
            branchIds,
            now,
          },
        );
      if (!employee) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Employee changed",
          "Reload the employee and retry the scope change.",
          before.version,
        );
      }
      if (permissionSet) {
        const grants = permissionSet.grants.filter(
          (grant) => !grant.branchId || branchIds.includes(grant.branchId),
        );
        const replaced =
          await this.dependencies.identityAccess.replacePermissionSet(
            transaction,
            {
              businessAccountId: context.businessAccountId,
              employeeId,
              expectedVersion: permissionSet.version,
              grants,
              grantedByUserId: context.userId,
              now,
            },
          );
        if (!replaced) {
          throw new ApplicationError(
            "concurrency_conflict",
            409,
            "Employee permissions changed",
            "Reload permissions and retry the scope change.",
          );
        }
      }
      await this.revokeEmployeeSessions(
        transaction,
        context.businessAccountId,
        employeeId,
        "branch_scope_changed",
        now,
      );
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action: "employee.branch_scope_replaced",
        targetType: "employee",
        targetId: employee.id,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        beforeData: { branchIds: before.branchIds },
        afterData: { branchIds: employee.branchIds },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "restaurant.employee_branch_scope_changed.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: employee.id,
        aggregateVersion: employee.version,
        actorId: context.userId,
        payload: {
          branch_ids: [...employee.branchIds],
          sessions_revoked: true,
        },
        metadata,
        now,
      });
      return employee;
    });
  }

  public async getEmployeePermissions(
    context: StaffRequestContext,
    employeeId: string,
  ): Promise<PermissionSet> {
    const employee = await this.getEmployee(context, employeeId);
    requirePermission(
      context,
      "employees.manage_permissions",
      employee.restaurantId,
    );
    const result = await this.dependencies.identityAccess.getPermissionSet(
      this.dependencies.databasePool,
      context.businessAccountId,
      employeeId,
    );
    if (!result) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Employee permissions not found",
      );
    }
    return result;
  }

  public async replaceEmployeePermissions(
    context: StaffRequestContext,
    employeeId: string,
    expectedVersion: number,
    requestedGrants: readonly PermissionGrant[],
    reason: string,
    metadata: RequestMetadata,
  ): Promise<PermissionSet> {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);
    const employee = await this.getEmployee(context, employeeId);
    requirePermission(
      context,
      "employees.manage_permissions",
      employee.restaurantId,
    );
    const grants = uniqueGrants(requestedGrants);
    this.validateDelegableGrants(context, employee, grants);

    const result = await this.dependencies.workflow.run(async (transaction) => {
      const before = await this.dependencies.identityAccess.getPermissionSet(
        transaction.sql,
        context.businessAccountId,
        employeeId,
      );
      if (before?.version !== expectedVersion) {
        return { kind: "conflict" as const, currentVersion: before?.version };
      }
      const wasAdministrator =
        await this.dependencies.identityAccess.isEffectiveAdministrator(
          transaction.sql,
          context.businessAccountId,
          employeeId,
          administratorPermissionKeys,
        );
      if (wasAdministrator && !grantsContainAdministrator(grants)) {
        const count =
          await this.dependencies.identityAccess.countEffectiveAdministratorsForUpdate(
            transaction,
            context.businessAccountId,
            administratorPermissionKeys,
          );
        if (count <= 1) {
          await this.appendAudit(transaction, {
            businessAccountId: context.businessAccountId,
            restaurantId: employee.restaurantId,
            actorUserId: context.userId,
            action: "identity.last_administrator_permission_change_blocked",
            targetType: "employee",
            targetId: employeeId,
            outcome: "failed",
            reason,
            correlationId: metadata.correlationId,
            now,
          });
          return { kind: "last_administrator" as const };
        }
      }
      const permissionSet =
        await this.dependencies.identityAccess.replacePermissionSet(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            employeeId,
            expectedVersion,
            grants,
            grantedByUserId: context.userId,
            now,
          },
        );
      if (!permissionSet) {
        return { kind: "conflict" as const };
      }
      await this.revokeEmployeeSessions(
        transaction,
        context.businessAccountId,
        employeeId,
        "permissions_changed",
        now,
      );
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action: "identity.permissions_replaced",
        targetType: "employee",
        targetId: employeeId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        beforeData: before,
        afterData: permissionSet,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.permissions_changed.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: employeeId,
        aggregateVersion: permissionSet.version,
        actorId: context.userId,
        payload: { sessions_revoked: true },
        metadata,
        now,
      });
      return { kind: "updated" as const, permissionSet };
    });
    if (result.kind === "last_administrator") {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "The final administrator cannot lose required access",
        "Activate a replacement administrator before retrying.",
      );
    }
    if (result.kind === "conflict") {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Employee permissions changed",
        "Reload permissions and retry the change.",
        result.currentVersion,
      );
    }
    return result.permissionSet;
  }

  public async listPermissionTemplates(
    context: StaffRequestContext,
  ): Promise<readonly PermissionTemplate[]> {
    requirePermission(
      context,
      "employees.manage_permissions",
      context.restaurantId,
    );
    return this.dependencies.identityAccess.listPermissionTemplates(
      this.dependencies.databasePool,
      context.businessAccountId,
      context.restaurantId,
    );
  }

  public async applyPermissionTemplate(
    context: StaffRequestContext,
    employeeId: string,
    templateKey: PermissionTemplateKey,
    expectedVersion: number,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<PermissionSet> {
    const employee = await this.getEmployee(context, employeeId);
    const current = await this.getEmployeePermissions(context, employeeId);
    const template = (
      await this.dependencies.identityAccess.listPermissionTemplates(
        this.dependencies.databasePool,
        context.businessAccountId,
        employee.restaurantId,
      )
    ).find((item) => item.key === templateKey);
    if (!template?.active) {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "Permission template is inactive",
        "Choose an active predefined template.",
      );
    }
    const copied: PermissionGrant[] = [];
    for (const permissionKey of template.permissionKeys) {
      const permission = permissionDefinitionByKey.get(permissionKey);
      if (permission?.scope === "branch") {
        for (const branchId of employee.branchIds) {
          copied.push({
            permissionKey,
            restaurantId: employee.restaurantId,
            branchId,
          });
        }
      } else {
        copied.push({
          permissionKey,
          restaurantId: employee.restaurantId,
        });
      }
    }
    return this.replaceEmployeePermissions(
      context,
      employeeId,
      expectedVersion,
      uniqueGrants([...current.grants, ...copied]),
      reason,
      metadata,
    );
  }

  public async deactivatePermissionTemplate(
    context: StaffRequestContext,
    templateKey: PermissionTemplateKey,
    expectedVersion: number,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<PermissionTemplate> {
    const now = nowFrom(metadata);
    requirePermission(
      context,
      "employees.manage_permissions",
      context.restaurantId,
    );
    requireRecentAuthentication(context, now);
    return this.dependencies.workflow.run(async (transaction) => {
      const template =
        await this.dependencies.identityAccess.deactivatePermissionTemplate(
          transaction,
          {
            stateId: randomUUID(),
            businessAccountId: context.businessAccountId,
            restaurantId: context.restaurantId,
            templateKey,
            expectedVersion,
            updatedByUserId: context.userId,
            reason,
            now,
          },
        );
      if (!template) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Permission template changed",
          "Reload permission templates before trying again.",
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: context.restaurantId,
        actorUserId: context.userId,
        action: "identity.permission_template_deactivated",
        targetType: "restaurant_permission_template",
        targetId: template.stateId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        beforeData: { templateKey, version: expectedVersion, active: true },
        afterData: { templateKey, version: template.version, active: false },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.permission_template_deactivated.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: context.restaurantId,
        aggregateId: template.stateId,
        aggregateVersion: template.version,
        actorId: context.userId,
        payload: { templateKey, active: false },
        metadata,
        now,
      });
      return template;
    });
  }

  public async getFeatureConfiguration(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{
    readonly configuration: FeatureConfiguration;
    readonly catalog: typeof featureDefinitions;
  }> {
    const branch = await this.getBranch(context, branchId);
    requirePermission(context, "features.manage", branch.restaurantId);
    const configuration =
      await this.dependencies.restaurantConfiguration.getFeatureConfiguration(
        this.dependencies.databasePool,
        context.businessAccountId,
        branchId,
      );
    if (!configuration) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Feature configuration not found",
      );
    }
    return { configuration, catalog: featureDefinitions };
  }

  public async getRestaurantFeatureConfiguration(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<{
    readonly configuration: FeatureConfiguration;
    readonly catalog: typeof featureDefinitions;
  }> {
    requirePermission(context, "features.manage", restaurantId);
    const restaurant =
      await this.dependencies.restaurantConfiguration.getRestaurant(
        this.dependencies.databasePool,
        context.businessAccountId,
        restaurantId,
      );
    if (!restaurant) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Restaurant not found",
      );
    }
    const configuration =
      await this.dependencies.restaurantConfiguration.getRestaurantFeatureConfiguration(
        this.dependencies.databasePool,
        context.businessAccountId,
        restaurantId,
      );
    if (!configuration) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Feature configuration not found",
      );
    }
    return { configuration, catalog: featureDefinitions };
  }

  public async getPortalCapabilities(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{
    readonly branchId: string;
    readonly branchName: string;
    readonly restaurantId: string;
    readonly timeZone: string;
    readonly currency: string;
    readonly permissions: readonly PermissionKey[];
    readonly enabledFeatures: readonly string[];
    readonly configurationVersion: number;
  }> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (!branch) {
      throw new ApplicationError("resource_not_found", 404, "Branch not found");
    }
    const configuration =
      await this.dependencies.restaurantConfiguration.getFeatureConfiguration(
        this.dependencies.databasePool,
        context.businessAccountId,
        branchId,
      );
    if (!configuration) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Feature configuration not found",
      );
    }
    const restaurantConfiguration =
      await this.dependencies.restaurantConfiguration.getRestaurantFeatureConfiguration(
        this.dependencies.databasePool,
        context.businessAccountId,
        branch.restaurantId,
      );
    const effectiveValues = {
      ...(restaurantConfiguration?.values ?? {}),
      ...configuration.values,
    };
    const permissions = uniqueValues(
      context.grants
        .filter(
          (grant) =>
            (!grant.restaurantId ||
              grant.restaurantId === branch.restaurantId) &&
            (!grant.branchId || grant.branchId === branchId),
        )
        .map((grant) => grant.permissionKey),
    );
    return {
      branchId,
      branchName: branch.name,
      restaurantId: branch.restaurantId,
      timeZone: branch.timeZone,
      currency: branch.currency,
      permissions,
      enabledFeatures: featureDefinitions
        .filter((feature) => {
          const state = effectiveValues[feature.id];
          return (
            feature.mvp &&
            (state === "enabled" ||
              state === "automatic" ||
              (state === undefined && feature.defaultState === "enabled"))
          );
        })
        .map((feature) => feature.key),
      configurationVersion: configuration.version,
    };
  }

  public async updateFeatureConfiguration(
    context: StaffRequestContext,
    input: {
      readonly branchId: string;
      readonly expectedVersion: number;
      readonly changes: Readonly<Record<string, FeatureState>>;
      readonly confirmAffectedWorkflows: boolean;
      readonly reason: string;
    },
    metadata: RequestMetadata,
  ): Promise<FeatureConfiguration> {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);
    const before = await this.getFeatureConfiguration(context, input.branchId);
    const branch = await this.getBranch(context, input.branchId);
    const values = { ...before.configuration.values };
    for (const [featureId, value] of Object.entries(input.changes)) {
      const definition = featureDefinitionById.get(featureId);
      if (
        definition?.scope !== "branch" ||
        !definition.mvp ||
        !definition.mutableInMvp ||
        !["enabled", "disabled"].includes(value)
      ) {
        throw new ApplicationError(
          "validation_error",
          422,
          "Unsupported feature change",
          `${featureId} is not configurable in the MVP.`,
        );
      }
      values[featureId] = value;
    }
    if (
      Object.values(input.changes).includes("disabled") &&
      !input.confirmAffectedWorkflows
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Feature impact confirmation required",
        "Confirm that preserved data and active workflow behavior were reviewed.",
      );
    }
    this.validateFeatureDependencies(values);

    return this.dependencies.workflow.run(async (transaction) => {
      const configuration =
        await this.dependencies.restaurantConfiguration.appendFeatureConfiguration(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            restaurantId: branch.restaurantId,
            branchId: branch.id,
            expectedVersion: input.expectedVersion,
            values,
            createdByUserId: context.userId,
            reason: input.reason,
            now,
          },
        );
      if (!configuration) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Feature configuration changed",
          "Reload configuration and retry the change.",
          before.configuration.version,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        actorUserId: context.userId,
        action: "configuration.features_changed",
        targetType: "feature_configuration",
        targetId: configuration.id,
        outcome: "succeeded",
        reason: input.reason,
        correlationId: metadata.correlationId,
        beforeData: before.configuration,
        afterData: configuration,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "restaurant.feature_configuration_changed.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        aggregateId: configuration.id,
        aggregateVersion: configuration.version,
        actorId: context.userId,
        payload: { changes: input.changes, cache_invalidation_required: true },
        metadata,
        now,
      });
      return configuration;
    });
  }

  public async updateRestaurantFeatureConfiguration(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly expectedVersion: number;
      readonly changes: Readonly<Record<string, FeatureState>>;
      readonly confirmAffectedWorkflows: boolean;
      readonly reason: string;
    },
    metadata: RequestMetadata,
  ): Promise<FeatureConfiguration> {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);
    const before = await this.getRestaurantFeatureConfiguration(
      context,
      input.restaurantId,
    );
    const values = { ...before.configuration.values };
    for (const [featureId, value] of Object.entries(input.changes)) {
      const definition = featureDefinitionById.get(featureId);
      if (
        definition?.scope !== "restaurant" ||
        !definition.mvp ||
        !definition.mutableInMvp ||
        !["enabled", "disabled"].includes(value)
      ) {
        throw new ApplicationError(
          "validation_error",
          422,
          "Unsupported feature change",
          `${featureId} is not configurable in the MVP.`,
        );
      }
      values[featureId] = value;
    }
    if (
      Object.values(input.changes).includes("disabled") &&
      !input.confirmAffectedWorkflows
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Feature impact confirmation required",
      );
    }
    return this.dependencies.workflow.run(async (transaction) => {
      const configuration =
        await this.dependencies.restaurantConfiguration.appendRestaurantFeatureConfiguration(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            restaurantId: input.restaurantId,
            expectedVersion: input.expectedVersion,
            values,
            createdByUserId: context.userId,
            reason: input.reason,
            now,
          },
        );
      if (!configuration) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Feature configuration changed",
          "Reload configuration and retry the change.",
          before.configuration.version,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: input.restaurantId,
        actorUserId: context.userId,
        action: "configuration.restaurant_features_changed",
        targetType: "feature_configuration",
        targetId: configuration.id,
        outcome: "succeeded",
        reason: input.reason,
        correlationId: metadata.correlationId,
        beforeData: before.configuration,
        afterData: configuration,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "restaurant.feature_configuration_changed.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: input.restaurantId,
        aggregateId: configuration.id,
        aggregateVersion: configuration.version,
        actorId: context.userId,
        payload: { changes: input.changes, cache_invalidation_required: true },
        metadata,
        now,
      });
      return configuration;
    });
  }

  public async createSupportAccess(
    input: SupportAccessInput,
    metadata: RequestMetadata,
  ): Promise<{
    readonly grantId: string;
    readonly accessToken: string;
    readonly expiresAtUtc: Date;
  }> {
    const now = nowFrom(metadata);
    if (
      input.operatorId === input.approverId ||
      input.approvalReference.trim().length < 8 ||
      input.expiresAtUtc <= now ||
      input.expiresAtUtc.getTime() - now.getTime() > 4 * 60 * 60_000
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Invalid support authorization",
      );
    }
    const allowedSupportPermissions = new Set<PermissionKey>([
      "restaurant.view",
      "branches.view",
    ]);
    if (
      !input.permissionKeys.includes("restaurant.view") ||
      input.permissionKeys.some((key) => !allowedSupportPermissions.has(key))
    ) {
      throw new ApplicationError(
        "permission_denied",
        403,
        "Support scope exceeds read-only break-glass authority",
      );
    }
    const snapshot =
      await this.dependencies.restaurantConfiguration.getSupportTenantSnapshot(
        this.dependencies.databasePool,
        input.businessAccountId,
      );
    if (!snapshot) {
      throw new ApplicationError("resource_not_found", 404, "Tenant not found");
    }
    const restaurantIds = new Set(snapshot.restaurants.map((item) => item.id));
    const branchIds = new Set(snapshot.branches.map((item) => item.id));
    if (
      input.restaurantIds.some((id) => !restaurantIds.has(id)) ||
      input.branchIds.some((id) => !branchIds.has(id))
    ) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Support scope not found",
      );
    }
    if (
      (input.branchIds.length > 0 &&
        !input.permissionKeys.includes("branches.view")) ||
      (input.restaurantIds.length > 0 &&
        input.branchIds.some((branchId) => {
          const branch = snapshot.branches.find((item) => item.id === branchId);
          return (
            branch !== undefined &&
            !input.restaurantIds.includes(branch.restaurantId)
          );
        }))
    ) {
      throw new ApplicationError(
        "permission_denied",
        403,
        "Support resource scope exceeds approved read authority",
      );
    }
    const grantId = randomUUID();
    const token = this.dependencies.identitySecurity.createToken();
    await this.dependencies.workflow.run(async (transaction) => {
      await this.dependencies.identityAccess.createSupportAccessGrant(
        transaction,
        {
          id: grantId,
          businessAccountId: input.businessAccountId,
          operatorId: input.operatorId,
          approverId: input.approverId,
          approvalReference: input.approvalReference,
          reason: input.reason,
          scope: {
            permissionKeys: uniqueValues(input.permissionKeys),
            restaurantIds: uniqueValues(input.restaurantIds),
            branchIds: uniqueValues(input.branchIds),
          },
          tokenHash: token.hash,
          now,
          expiresAtUtc: input.expiresAtUtc,
        },
      );
      await this.appendAudit(transaction, {
        businessAccountId: input.businessAccountId,
        actorUserId: input.operatorId,
        action: "support.break_glass_granted",
        targetType: "support_access_grant",
        targetId: grantId,
        outcome: "succeeded",
        reason: input.reason,
        correlationId: metadata.correlationId,
        afterData: {
          approverId: input.approverId,
          approvalReference: input.approvalReference,
          permissionKeys: input.permissionKeys,
          expiresAtUtc: input.expiresAtUtc,
        },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.support_access_granted.v1",
        businessAccountId: input.businessAccountId,
        aggregateId: grantId,
        aggregateVersion: 1,
        actorId: input.operatorId,
        payload: { expires_at_utc: input.expiresAtUtc.toISOString() },
        metadata,
        now,
      });
    });
    return {
      grantId,
      accessToken: token.raw,
      expiresAtUtc: input.expiresAtUtc,
    };
  }

  public async inspectTenantWithSupportAccess(
    accessToken: string,
    businessAccountId: string,
    metadata: RequestMetadata,
  ): Promise<SupportTenantSnapshot> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const grant =
        await this.dependencies.identityAccess.getSupportAccessGrant(
          transaction.sql,
          this.dependencies.identitySecurity.hashToken(accessToken),
          now,
        );
      if (
        grant?.businessAccountId !== businessAccountId ||
        !grant.scope.permissionKeys.includes("restaurant.view")
      ) {
        throw new ApplicationError(
          "authentication_required",
          401,
          "Valid support access required",
        );
      }
      const snapshot =
        await this.dependencies.restaurantConfiguration.getSupportTenantSnapshot(
          transaction.sql,
          businessAccountId,
        );
      if (!snapshot) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Tenant not found",
        );
      }
      const filtered: SupportTenantSnapshot = {
        ...snapshot,
        restaurants:
          grant.scope.restaurantIds.length === 0
            ? snapshot.restaurants
            : snapshot.restaurants.filter((item) =>
                grant.scope.restaurantIds.includes(item.id),
              ),
        branches: !grant.scope.permissionKeys.includes("branches.view")
          ? []
          : grant.scope.branchIds.length === 0
            ? snapshot.branches
            : snapshot.branches.filter((item) =>
                grant.scope.branchIds.includes(item.id),
              ),
      };
      await this.appendAudit(transaction, {
        businessAccountId,
        actorUserId: grant.operatorId,
        action: "support.tenant_context_viewed",
        targetType: "business_account",
        targetId: businessAccountId,
        outcome: "succeeded",
        reason: grant.reason,
        correlationId: metadata.correlationId,
        afterData: { supportAccessGrantId: grant.id },
        now,
      });
      return filtered;
    });
  }

  public async revokeSupportAccess(
    grantId: string,
    operatorId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    const grant = await this.dependencies.workflow.run(async (transaction) => {
      const revoked =
        await this.dependencies.identityAccess.revokeSupportAccessGrant(
          transaction,
          { grantId, operatorId, reason, now },
        );
      if (!revoked) {
        return undefined;
      }
      await this.appendAudit(transaction, {
        businessAccountId: revoked.businessAccountId,
        actorUserId: operatorId,
        action: "support.break_glass_revoked",
        targetType: "support_access_grant",
        targetId: grantId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.support_access_revoked.v1",
        businessAccountId: revoked.businessAccountId,
        aggregateId: grantId,
        aggregateVersion: 2,
        actorId: operatorId,
        payload: { access_token_invalidated: true },
        metadata,
        now,
      });
      return revoked;
    });
    if (!grant) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Support access grant not found",
      );
    }
  }

  public async inviteStaff(
    context: StaffRequestContext,
    employeeId: string,
    metadata: RequestMetadata,
  ): Promise<{
    readonly invitationToken: string;
    readonly expiresAtUtc: Date;
  }> {
    const employee =
      await this.dependencies.restaurantConfiguration.getEmployee(
        this.dependencies.databasePool,
        context.businessAccountId,
        employeeId,
      );
    if (employee?.status !== "active") {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Employee not found",
      );
    }
    requirePermission(context, "employees.manage", employee.restaurantId);
    const now = nowFrom(metadata);
    const expiresAtUtc = new Date(now.getTime() + 24 * 60 * 60_000);
    const token = this.dependencies.identitySecurity.createToken();

    await this.dependencies.workflow.run(async (transaction) => {
      const invitation =
        await this.dependencies.identityAccess.createInvitation(transaction, {
          id: randomUUID(),
          businessAccountId: context.businessAccountId,
          employeeId,
          emailNormalized: this.dependencies.identitySecurity.normalizeEmail(
            employee.email,
          ),
          tokenHash: token.hash,
          createdByUserId: context.userId,
          now,
          expiresAtUtc,
        });
      if (!invitation) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Employee identity is already active",
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action: "identity.staff_invited",
        targetType: "employee",
        targetId: employeeId,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        afterData: { invitationId: invitation.invitationId, expiresAtUtc },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.staff_invited.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: invitation.invitationId,
        aggregateVersion: 1,
        actorId: context.userId,
        payload: { employee_id: employeeId, expires_at_utc: expiresAtUtc },
        metadata,
        now,
      });
    });

    return { invitationToken: token.raw, expiresAtUtc };
  }

  public async acceptInvitation(
    token: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    const passwordHash =
      await this.dependencies.identitySecurity.hashPassword(password);
    const accepted = await this.dependencies.workflow.run(
      async (transaction) => {
        const invitation =
          await this.dependencies.identityAccess.acceptInvitation(
            transaction,
            this.dependencies.identitySecurity.hashToken(token),
            passwordHash,
            now,
          );
        if (!invitation) {
          return undefined;
        }
        await this.appendAudit(transaction, {
          businessAccountId: invitation.businessAccountId,
          restaurantId: invitation.restaurantId,
          actorUserId: invitation.userId,
          action: "identity.invitation_accepted",
          targetType: "employee",
          targetId: invitation.employeeId,
          outcome: "succeeded",
          correlationId: metadata.correlationId,
          now,
        });
        await this.appendEvent(transaction, {
          eventType: "identity.invitation_accepted.v1",
          businessAccountId: invitation.businessAccountId,
          restaurantId: invitation.restaurantId,
          aggregateId: invitation.userId,
          aggregateVersion: 1,
          actorId: invitation.userId,
          payload: { employee_id: invitation.employeeId },
          metadata,
          now,
        });
        return invitation;
      },
    );
    if (!accepted) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Invitation not found",
        "The invitation is invalid, expired, or already used.",
      );
    }
  }

  public async requestRecovery(
    input: { readonly businessCode: string; readonly email: string },
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    const user = await this.dependencies.identityAccess.findRecoveryUser(
      this.dependencies.databasePool,
      input.businessCode,
      this.dependencies.identitySecurity.normalizeEmail(input.email),
    );
    if (user?.status !== "active") {
      return;
    }
    const token = this.dependencies.identitySecurity.createToken();
    const expiresAtUtc = new Date(now.getTime() + 30 * 60_000);
    await this.dependencies.workflow.run(async (transaction) => {
      await this.dependencies.identityAccess.createRecoveryToken(transaction, {
        id: randomUUID(),
        businessAccountId: user.businessAccountId,
        userId: user.id,
        tokenHash: token.hash,
        now,
        expiresAtUtc,
      });
      await this.appendAudit(transaction, {
        businessAccountId: user.businessAccountId,
        restaurantId: user.restaurantId,
        actorUserId: user.id,
        action: "identity.recovery_requested",
        targetType: "user",
        targetId: user.id,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        now,
      });
    });
    await this.dependencies.credentialTokenDelivery.deliverRecoveryToken({
      businessCode: input.businessCode,
      email: input.email,
      token: token.raw,
      expiresAtUtc,
    });
  }

  public async completeRecovery(
    token: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    const passwordHash =
      await this.dependencies.identitySecurity.hashPassword(password);
    const completed = await this.dependencies.workflow.run(
      async (transaction) => {
        const user = await this.dependencies.identityAccess.completeRecovery(
          transaction,
          this.dependencies.identitySecurity.hashToken(token),
          passwordHash,
          now,
        );
        if (!user) {
          return undefined;
        }
        await this.dependencies.identityAccess.revokeUserSessions(
          transaction,
          user.businessAccountId,
          user.id,
          "credential_reset",
          now,
        );
        await this.appendAudit(transaction, {
          businessAccountId: user.businessAccountId,
          restaurantId: user.restaurantId,
          actorUserId: user.id,
          action: "identity.recovery_completed",
          targetType: "user",
          targetId: user.id,
          outcome: "succeeded",
          correlationId: metadata.correlationId,
          now,
        });
        await this.appendEvent(transaction, {
          eventType: "identity.credentials_recovered.v1",
          businessAccountId: user.businessAccountId,
          restaurantId: user.restaurantId,
          aggregateId: user.id,
          aggregateVersion: user.credentialVersion,
          actorId: user.id,
          payload: { sessions_revoked: true },
          metadata,
          now,
        });
        return user;
      },
    );
    if (!completed) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Recovery request not found",
        "The recovery request is invalid, expired, or already used.",
      );
    }
  }

  public async removeAdministrator(
    context: StaffRequestContext,
    employeeId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);

    const result = await this.dependencies.workflow.run(async (transaction) => {
      const employee =
        await this.dependencies.restaurantConfiguration.getEmployee(
          transaction.sql,
          context.businessAccountId,
          employeeId,
        );
      if (!employee) {
        return { kind: "not_found" as const };
      }
      requirePermission(
        context,
        "employees.manage_permissions",
        employee.restaurantId,
      );
      const isAdministrator =
        await this.dependencies.identityAccess.isEffectiveAdministrator(
          transaction.sql,
          context.businessAccountId,
          employeeId,
          administratorPermissionKeys,
        );
      if (!isAdministrator) {
        return { kind: "not_found" as const };
      }
      const count =
        await this.dependencies.identityAccess.countEffectiveAdministratorsForUpdate(
          transaction,
          context.businessAccountId,
          administratorPermissionKeys,
        );
      if (count <= 1) {
        await this.appendAudit(transaction, {
          businessAccountId: context.businessAccountId,
          restaurantId: context.restaurantId,
          actorUserId: context.userId,
          action: "identity.last_administrator_removal_blocked",
          targetType: "employee",
          targetId: employeeId,
          outcome: "failed",
          reason,
          correlationId: metadata.correlationId,
          now,
        });
        return { kind: "last_administrator" as const };
      }
      await this.dependencies.identityAccess.removeAdministratorGrants(
        transaction,
        context.businessAccountId,
        employeeId,
        administratorPermissionKeys,
        now,
      );
      const targetUser = await this.dependencies.identityAccess.userForEmployee(
        transaction.sql,
        context.businessAccountId,
        employeeId,
      );
      if (targetUser) {
        await this.dependencies.identityAccess.revokeUserSessions(
          transaction,
          context.businessAccountId,
          targetUser.id,
          "critical_permission_revoked",
          now,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: context.restaurantId,
        actorUserId: context.userId,
        action: "identity.administrator_removed",
        targetType: "employee",
        targetId: employeeId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.administrator_removed.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: context.restaurantId,
        aggregateId: employeeId,
        aggregateVersion: 1,
        actorId: context.userId,
        payload: { sessions_revoked: true },
        metadata,
        now,
      });
      return { kind: "removed" as const };
    });
    if (result.kind === "not_found") {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Administrator not found",
      );
    }
    if (result.kind === "last_administrator") {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "The final administrator cannot be removed",
        "Activate a replacement administrator before retrying.",
      );
    }
  }

  public async transferAdministrator(
    context: StaffRequestContext,
    replacementEmployeeId: string,
    removeCurrentAdministrator: boolean,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    requirePermission(
      context,
      "employees.manage_permissions",
      context.restaurantId,
    );
    requireRecentAuthentication(context, now);

    const result = await this.dependencies.workflow.run(async (transaction) => {
      const replacement =
        await this.dependencies.restaurantConfiguration.getEmployee(
          transaction.sql,
          context.businessAccountId,
          replacementEmployeeId,
        );
      const replacementUser =
        await this.dependencies.identityAccess.userForEmployee(
          transaction.sql,
          context.businessAccountId,
          replacementEmployeeId,
        );
      if (
        replacement?.status !== "active" ||
        replacementUser?.status !== "active"
      ) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Replacement administrator is not active",
        );
      }
      requirePermission(
        context,
        "employees.manage_permissions",
        replacement.restaurantId,
      );
      await this.dependencies.identityAccess.countEffectiveAdministratorsForUpdate(
        transaction,
        context.businessAccountId,
        administratorPermissionKeys,
      );
      if (
        removeCurrentAdministrator &&
        replacementEmployeeId === context.employeeId
      ) {
        await this.appendAudit(transaction, {
          businessAccountId: context.businessAccountId,
          restaurantId: replacement.restaurantId,
          actorUserId: context.userId,
          action: "identity.administrator_transfer_blocked",
          targetType: "employee",
          targetId: replacementEmployeeId,
          outcome: "failed",
          reason,
          correlationId: metadata.correlationId,
          now,
        });
        return { kind: "same_administrator" as const };
      }
      await this.dependencies.identityAccess.grantAdministrator(
        transaction,
        context.businessAccountId,
        replacementEmployeeId,
        undefined,
        context.userId,
        administratorPermissionKeys,
        now,
      );
      if (removeCurrentAdministrator) {
        await this.dependencies.identityAccess.removeAdministratorGrants(
          transaction,
          context.businessAccountId,
          context.employeeId,
          administratorPermissionKeys,
          now,
        );
        await this.dependencies.identityAccess.revokeUserSessions(
          transaction,
          context.businessAccountId,
          context.userId,
          "administrator_transferred",
          now,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: replacement.restaurantId,
        actorUserId: context.userId,
        action: "identity.administrator_transferred",
        targetType: "employee",
        targetId: replacementEmployeeId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        afterData: { previousAdministratorRemoved: removeCurrentAdministrator },
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.administrator_transferred.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: replacement.restaurantId,
        aggregateId: replacementEmployeeId,
        aggregateVersion: 1,
        actorId: context.userId,
        payload: {
          previous_administrator_removed: removeCurrentAdministrator,
        },
        metadata,
        now,
      });
      return { kind: "transferred" as const };
    });
    if (result.kind === "same_administrator") {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "A different replacement administrator is required",
      );
    }
  }

  public async deactivateEmployee(
    context: StaffRequestContext,
    employeeId: string,
    expectedVersion: number,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const now = nowFrom(metadata);
    requireRecentAuthentication(context, now);

    const result = await this.dependencies.workflow.run(async (transaction) => {
      const targetEmployee =
        await this.dependencies.restaurantConfiguration.getEmployee(
          transaction.sql,
          context.businessAccountId,
          employeeId,
        );
      if (!targetEmployee) {
        return { kind: "not_found_or_conflict" as const };
      }
      requirePermission(
        context,
        "employees.manage",
        targetEmployee.restaurantId,
      );
      const isAdministrator =
        await this.dependencies.identityAccess.isEffectiveAdministrator(
          transaction.sql,
          context.businessAccountId,
          employeeId,
          administratorPermissionKeys,
        );
      if (isAdministrator) {
        const count =
          await this.dependencies.identityAccess.countEffectiveAdministratorsForUpdate(
            transaction,
            context.businessAccountId,
            administratorPermissionKeys,
          );
        if (count <= 1) {
          await this.appendAudit(transaction, {
            businessAccountId: context.businessAccountId,
            restaurantId: context.restaurantId,
            actorUserId: context.userId,
            action: "identity.last_administrator_deactivation_blocked",
            targetType: "employee",
            targetId: employeeId,
            outcome: "failed",
            reason,
            correlationId: metadata.correlationId,
            now,
          });
          return { kind: "last_administrator" as const };
        }
      }
      const employee =
        await this.dependencies.restaurantConfiguration.deactivateEmployee(
          transaction,
          context.businessAccountId,
          employeeId,
          expectedVersion,
          now,
        );
      if (!employee) {
        return { kind: "not_found_or_conflict" as const };
      }
      const user =
        await this.dependencies.identityAccess.disableUserForEmployee(
          transaction,
          context.businessAccountId,
          employeeId,
          now,
        );
      if (user) {
        await this.dependencies.identityAccess.revokeUserSessions(
          transaction,
          context.businessAccountId,
          user.id,
          "employee_deactivated",
          now,
        );
      }
      await this.appendAudit(transaction, {
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        actorUserId: context.userId,
        action: "employee.deactivated",
        targetType: "employee",
        targetId: employeeId,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        now,
      });
      await this.appendEvent(transaction, {
        eventType: "identity.employee_deactivated.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: employee.restaurantId,
        aggregateId: employeeId,
        aggregateVersion: employee.version,
        actorId: context.userId,
        payload: { sessions_revoked: Boolean(user) },
        metadata,
        now,
      });
      return { kind: "deactivated" as const };
    });
    if (result.kind === "last_administrator") {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "The final administrator cannot be deactivated",
        "Activate a replacement administrator before retrying.",
      );
    }
    if (result.kind === "not_found_or_conflict") {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Employee changed",
        "Reload the employee and retry the change.",
      );
    }
  }

  private async validateDelegableBranches(
    context: StaffRequestContext,
    restaurantId: string,
    branchIds: readonly string[],
  ): Promise<void> {
    if (
      branchIds.length === 0 ||
      uniqueValues(branchIds).length !== branchIds.length
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "At least one unique branch assignment is required",
      );
    }
    for (const branchId of branchIds) {
      if (!context.authorizedBranchIds.includes(branchId)) {
        throw new ApplicationError(
          "permission_denied",
          403,
          "Branch scope cannot be delegated",
        );
      }
      const branch = await this.dependencies.restaurantConfiguration.getBranch(
        this.dependencies.databasePool,
        context.businessAccountId,
        branchId,
      );
      if (branch?.restaurantId !== restaurantId) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Branch not found",
        );
      }
    }
  }

  private validateDelegableGrants(
    context: StaffRequestContext,
    employee: EmployeeReference,
    grants: readonly PermissionGrant[],
  ): void {
    for (const grant of grants) {
      const permission = permissionDefinitionByKey.get(grant.permissionKey);
      if (!permission || permission.scope === "platform") {
        throw new ApplicationError(
          "permission_denied",
          403,
          "Permission cannot be delegated",
        );
      }
      if (permission.scope === "restaurant") {
        if (
          grant.branchId ||
          (grant.restaurantId !== undefined &&
            grant.restaurantId !== employee.restaurantId)
        ) {
          throw new ApplicationError(
            "validation_error",
            422,
            "Invalid restaurant permission scope",
          );
        }
        if (grant.restaurantId === undefined) {
          const tenantWide = context.grants.some(
            (actorGrant) =>
              actorGrant.permissionKey === grant.permissionKey &&
              actorGrant.restaurantId === undefined &&
              actorGrant.branchId === undefined,
          );
          if (!tenantWide) {
            throw new ApplicationError(
              "permission_denied",
              403,
              "Permission scope exceeds delegable authority",
            );
          }
        } else if (
          !hasPermission(context, grant.permissionKey, employee.restaurantId)
        ) {
          throw new ApplicationError(
            "permission_denied",
            403,
            "Permission exceeds delegable authority",
          );
        }
        continue;
      }
      if (
        !grant.branchId ||
        !employee.branchIds.includes(grant.branchId) ||
        (grant.restaurantId !== undefined &&
          grant.restaurantId !== employee.restaurantId) ||
        !hasPermission(
          context,
          grant.permissionKey,
          employee.restaurantId,
          grant.branchId,
        )
      ) {
        throw new ApplicationError(
          "permission_denied",
          403,
          "Branch permission exceeds delegable authority",
        );
      }
    }
  }

  private validateFeatureDependencies(
    values: Readonly<Record<string, FeatureState>>,
  ): void {
    for (const feature of featureDefinitions) {
      if (values[feature.id] !== "enabled") {
        continue;
      }
      for (const dependency of feature.dependsOn) {
        const dependencyState = values[dependency];
        if (
          dependencyState !== undefined &&
          dependencyState !== "enabled" &&
          dependencyState !== "automatic"
        ) {
          throw new ApplicationError(
            "invalid_state_transition",
            409,
            "Feature dependency would be invalid",
            `${feature.id} requires ${dependency} to remain enabled.`,
          );
        }
      }
    }
  }

  private async revokeEmployeeSessions(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    reason: string,
    now: Date,
  ): Promise<number> {
    const user = await this.dependencies.identityAccess.userForEmployee(
      transaction.sql,
      businessAccountId,
      employeeId,
    );
    return user
      ? this.dependencies.identityAccess.revokeUserSessions(
          transaction,
          businessAccountId,
          user.id,
          reason,
          now,
        )
      : 0;
  }

  private appendAudit(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly restaurantId?: string;
      readonly branchId?: string;
      readonly actorUserId?: string;
      readonly action: string;
      readonly targetType: string;
      readonly targetId: string;
      readonly outcome: "attempted" | "succeeded" | "failed";
      readonly reason?: string;
      readonly correlationId: string;
      readonly beforeData?: unknown;
      readonly afterData?: unknown;
      readonly now: Date;
    },
  ): Promise<void> {
    return this.dependencies.audit.appendInTransaction(transaction, {
      id: randomUUID(),
      businessAccountId: input.businessAccountId,
      ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      outcome: input.outcome,
      ...(input.reason ? { reason: input.reason } : {}),
      correlationId: input.correlationId,
      ...(input.beforeData ? { beforeData: input.beforeData } : {}),
      ...(input.afterData ? { afterData: input.afterData } : {}),
      occurredAtUtc: input.now,
    });
  }

  private appendEvent(
    transaction: TransactionContext,
    input: {
      readonly eventType: string;
      readonly businessAccountId: string;
      readonly restaurantId?: string;
      readonly branchId?: string;
      readonly aggregateId: string;
      readonly aggregateVersion: number;
      readonly actorId?: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly metadata: RequestMetadata;
      readonly now: Date;
    },
  ): Promise<void> {
    return appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType: input.eventType,
      businessAccountId: input.businessAccountId,
      ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      occurredAtUtc: input.now,
      correlationId: input.metadata.correlationId,
      causationId: input.metadata.causationId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      payload: input.payload,
    });
  }

  private async auditAndEventForConfigurationChange(
    transaction: TransactionContext,
    input: {
      readonly action: string;
      readonly eventType: string;
      readonly context: StaffRequestContext;
      readonly targetType: string;
      readonly targetId: string;
      readonly restaurantId: string;
      readonly branchId?: string;
      readonly aggregateVersion: number;
      readonly beforeData?: unknown;
      readonly afterData?: unknown;
      readonly metadata: RequestMetadata;
      readonly now: Date;
    },
  ): Promise<void> {
    await this.appendAudit(transaction, {
      businessAccountId: input.context.businessAccountId,
      restaurantId: input.restaurantId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      actorUserId: input.context.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      outcome: "succeeded",
      correlationId: input.metadata.correlationId,
      ...(input.beforeData ? { beforeData: input.beforeData } : {}),
      ...(input.afterData ? { afterData: input.afterData } : {}),
      now: input.now,
    });
    await this.appendEvent(transaction, {
      eventType: input.eventType,
      businessAccountId: input.context.businessAccountId,
      restaurantId: input.restaurantId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      aggregateId: input.targetId,
      aggregateVersion: input.aggregateVersion,
      actorId: input.context.userId,
      payload: {
        action: input.action,
      },
      metadata: input.metadata,
      now: input.now,
    });
  }
}
