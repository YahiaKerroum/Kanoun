import { randomUUID } from "node:crypto";
import type { DatabasePool, TransactionContext } from "@rms/building-blocks";
import { appendOutboxMessage } from "@rms/building-blocks";
import {
  administratorPermissionKeys,
  ApplicationError,
  hasPermission,
  type Address,
  type AuditWriter,
  type BranchRecord,
  type ContactInformation,
  type IdentityAccessStore,
  type IdentitySecurity,
  type OpeningPeriod,
  type RestaurantConfigurationStore,
  type RestaurantRecord,
  type StaffRequestContext,
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

export interface TenantOwnerServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly identityAccess: IdentityAccessStore;
  readonly identitySecurity: IdentitySecurity;
  readonly audit: AuditWriter;
  readonly credentialTokenDelivery: CredentialTokenDelivery;
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
