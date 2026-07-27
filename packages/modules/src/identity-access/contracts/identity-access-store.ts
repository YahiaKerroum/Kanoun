import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type { PermissionKey } from "../domain/permission-catalog.js";
import type { StaffRequestContext } from "../domain/session-context.js";

export interface UserCredentialRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly employeeId: string;
  readonly restaurantId: string;
  readonly passwordHash?: string;
  readonly credentialVersion: number;
  readonly status: "invited" | "active" | "disabled";
}

export interface CreateOwnerIdentityInput {
  readonly userId: string;
  readonly businessAccountId: string;
  readonly employeeId: string;
  readonly emailNormalized: string;
  readonly passwordHash: string;
  readonly permissionKeys: readonly PermissionKey[];
  readonly restaurantId?: string;
  readonly now: Date;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly activeBranchId?: string;
  readonly credentialVersion: number;
  readonly now: Date;
  readonly expiresAtUtc: Date;
}

export interface CreateInvitationInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly employeeId: string;
  readonly emailNormalized: string;
  readonly tokenHash: string;
  readonly createdByUserId: string;
  readonly now: Date;
  readonly expiresAtUtc: Date;
}

export interface InvitationRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly employeeId: string;
  readonly userId: string;
  readonly restaurantId: string;
}

export interface RecoveryTokenInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly now: Date;
  readonly expiresAtUtc: Date;
}

export interface IdentityAccessStore {
  createOwnerIdentity(
    transaction: TransactionContext,
    input: CreateOwnerIdentityInput,
  ): Promise<void>;
  findCredentialsForLogin(
    sql: SqlExecutor,
    businessCode: string,
    emailNormalized: string,
  ): Promise<UserCredentialRecord | undefined>;
  createSession(
    transaction: TransactionContext,
    input: CreateSessionInput,
  ): Promise<void>;
  getSessionContext(
    sql: SqlExecutor,
    tokenHash: string,
    now: Date,
  ): Promise<
    (StaffRequestContext & { readonly csrfTokenHash: string }) | undefined
  >;
  revokeSession(
    transaction: TransactionContext,
    businessAccountId: string,
    sessionId: string,
    reason: string,
    now: Date,
  ): Promise<boolean>;
  revokeUserSessions(
    transaction: TransactionContext,
    businessAccountId: string,
    userId: string,
    reason: string,
    now: Date,
  ): Promise<number>;
  switchActiveBranch(
    transaction: TransactionContext,
    context: StaffRequestContext,
    branchId: string,
  ): Promise<boolean>;
  createInvitation(
    transaction: TransactionContext,
    input: CreateInvitationInput,
  ): Promise<
    { readonly invitationId: string; readonly userId: string } | undefined
  >;
  acceptInvitation(
    transaction: TransactionContext,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<InvitationRecord | undefined>;
  createRecoveryToken(
    transaction: TransactionContext,
    input: RecoveryTokenInput,
  ): Promise<void>;
  findRecoveryUser(
    sql: SqlExecutor,
    businessCode: string,
    emailNormalized: string,
  ): Promise<UserCredentialRecord | undefined>;
  completeRecovery(
    transaction: TransactionContext,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<UserCredentialRecord | undefined>;
  userForEmployee(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<UserCredentialRecord | undefined>;
  isEffectiveAdministrator(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
    requiredPermissions: readonly PermissionKey[],
  ): Promise<boolean>;
  countEffectiveAdministratorsForUpdate(
    transaction: TransactionContext,
    businessAccountId: string,
    requiredPermissions: readonly PermissionKey[],
  ): Promise<number>;
  grantAdministrator(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    restaurantId: string | undefined,
    grantedByUserId: string,
    permissionKeys: readonly PermissionKey[],
    now: Date,
  ): Promise<void>;
  removeAdministratorGrants(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    permissionKeys: readonly PermissionKey[],
    now: Date,
  ): Promise<number>;
  disableUserForEmployee(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    now: Date,
  ): Promise<UserCredentialRecord | undefined>;
}
