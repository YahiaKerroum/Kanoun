import { randomUUID } from "node:crypto";
import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type {
  CreateInvitationInput,
  CreateOwnerIdentityInput,
  CreateSupportAccessGrantInput,
  CreateSessionInput,
  IdentityAccessStore,
  InvitationRecord,
  NotificationRecipient,
  PermissionGrant,
  PermissionSet,
  PermissionTemplate,
  PermissionTemplateStateChange,
  RecoveryTokenInput,
  SupportAccessGrant,
  UserCredentialRecord,
} from "../contracts/identity-access-store.js";
import {
  permissionKeys,
  type PermissionKey,
} from "../domain/permission-catalog.js";
import type { StaffRequestContext } from "../domain/session-context.js";

interface CredentialRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly employee_id: string;
  readonly restaurant_id: string;
  readonly password_hash: string | null;
  readonly credential_version: number;
  readonly status: UserCredentialRecord["status"];
}

interface SessionRow {
  readonly session_id: string;
  readonly business_account_id: string;
  readonly user_id: string;
  readonly employee_id: string;
  readonly restaurant_id: string;
  readonly active_branch_id: string | null;
  readonly csrf_token_hash: string;
  readonly authenticated_at_utc: Date;
  readonly expires_at_utc: Date;
}

interface GrantRow {
  readonly permission_key: string;
  readonly restaurant_id: string | null;
  readonly branch_id: string | null;
}

interface BranchAccessRow {
  readonly branch_id: string;
}

function mapCredential(row: CredentialRow): UserCredentialRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    employeeId: row.employee_id,
    restaurantId: row.restaurant_id,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    credentialVersion: row.credential_version,
    status: row.status,
  };
}

function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as readonly string[]).includes(value);
}

export class PostgresIdentityAccessStore implements IdentityAccessStore {
  public async createOwnerIdentity(
    transaction: TransactionContext,
    input: CreateOwnerIdentityInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into identity.users (
          id,
          business_account_id,
          employee_id,
          email_normalized,
          password_hash,
          status,
          verified_at_utc,
          credential_version,
          created_at_utc,
          updated_at_utc
        )
        values ($1, $2, $3, $4, $5, 'active', $6, 1, $6, $6)
      `,
      [
        input.userId,
        input.businessAccountId,
        input.employeeId,
        input.emailNormalized,
        input.passwordHash,
        input.now,
      ],
    );

    await this.initializePermissionSet(
      transaction,
      input.businessAccountId,
      input.employeeId,
      input.now,
    );
    await this.grantAdministrator(
      transaction,
      input.businessAccountId,
      input.employeeId,
      input.restaurantId,
      input.userId,
      input.permissionKeys,
      input.now,
    );
  }

  public async findCredentialsForLogin(
    sql: SqlExecutor,
    businessCode: string,
    emailNormalized: string,
  ): Promise<UserCredentialRecord | undefined> {
    const result = await sql.query<CredentialRow>(
      `
        select
          u.id,
          u.business_account_id,
          u.employee_id,
          e.restaurant_id,
          u.password_hash,
          u.credential_version,
          u.status
        from identity.users u
        inner join restaurant.business_accounts ba
          on ba.id = u.business_account_id
        inner join restaurant.employees e
          on e.business_account_id = u.business_account_id
          and e.id = u.employee_id
        inner join restaurant.restaurants r
          on r.business_account_id = e.business_account_id
          and r.id = e.restaurant_id
        where ba.code = $1
          and u.email_normalized = $2
          and ba.status = 'active'
          and e.status = 'active'
          and r.status = 'active'
      `,
      [businessCode, emailNormalized],
    );
    const row = result.rows[0];
    return row ? mapCredential(row) : undefined;
  }

  public async createSession(
    transaction: TransactionContext,
    input: CreateSessionInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into identity.staff_sessions (
          id,
          business_account_id,
          user_id,
          token_hash,
          csrf_token_hash,
          active_branch_id,
          credential_version,
          authenticated_at_utc,
          created_at_utc,
          expires_at_utc,
          last_seen_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $8)
      `,
      [
        input.id,
        input.businessAccountId,
        input.userId,
        input.tokenHash,
        input.csrfTokenHash,
        input.activeBranchId ?? null,
        input.credentialVersion,
        input.now,
        input.expiresAtUtc,
      ],
    );
  }

  public async getSessionContext(
    sql: SqlExecutor,
    tokenHash: string,
    now: Date,
  ): Promise<
    (StaffRequestContext & { readonly csrfTokenHash: string }) | undefined
  > {
    const sessionResult = await sql.query<SessionRow>(
      `
        select
          s.id as session_id,
          s.business_account_id,
          s.user_id,
          u.employee_id,
          e.restaurant_id,
          s.active_branch_id,
          s.csrf_token_hash,
          s.authenticated_at_utc,
          s.expires_at_utc
        from identity.staff_sessions s
        inner join identity.users u
          on u.business_account_id = s.business_account_id
          and u.id = s.user_id
        inner join restaurant.business_accounts ba
          on ba.id = s.business_account_id
        inner join restaurant.employees e
          on e.business_account_id = u.business_account_id
          and e.id = u.employee_id
        inner join restaurant.restaurants r
          on r.business_account_id = e.business_account_id
          and r.id = e.restaurant_id
        where s.token_hash = $1
          and s.revoked_at_utc is null
          and s.expires_at_utc > $2
          and s.credential_version = u.credential_version
          and u.status = 'active'
          and ba.status = 'active'
          and e.status = 'active'
          and r.status = 'active'
      `,
      [tokenHash, now],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return undefined;
    }

    const [grantResult, branchResult] = await Promise.all([
      sql.query<GrantRow>(
        `
          select permission_key, restaurant_id, branch_id
          from identity.permission_grants
          where business_account_id = $1
            and employee_id = $2
            and revoked_at_utc is null
        `,
        [session.business_account_id, session.employee_id],
      ),
      sql.query<BranchAccessRow>(
        `
          select branch_id
          from restaurant.employee_branch_access
          where business_account_id = $1 and employee_id = $2
          order by branch_id
        `,
        [session.business_account_id, session.employee_id],
      ),
    ]);

    return {
      sessionId: session.session_id,
      businessAccountId: session.business_account_id,
      userId: session.user_id,
      employeeId: session.employee_id,
      restaurantId: session.restaurant_id,
      ...(session.active_branch_id
        ? { activeBranchId: session.active_branch_id }
        : {}),
      authorizedBranchIds: branchResult.rows.map((row) => row.branch_id),
      grants: grantResult.rows.flatMap((row) =>
        isPermissionKey(row.permission_key)
          ? [
              {
                permissionKey: row.permission_key,
                ...(row.restaurant_id
                  ? { restaurantId: row.restaurant_id }
                  : {}),
                ...(row.branch_id ? { branchId: row.branch_id } : {}),
              },
            ]
          : [],
      ),
      authenticatedAtUtc: session.authenticated_at_utc,
      expiresAtUtc: session.expires_at_utc,
      csrfTokenHash: session.csrf_token_hash,
    };
  }

  public async revokeSession(
    transaction: TransactionContext,
    businessAccountId: string,
    sessionId: string,
    reason: string,
    now: Date,
  ): Promise<boolean> {
    const result = await transaction.sql.query(
      `
        update identity.staff_sessions
        set revoked_at_utc = $4, revocation_reason = $3
        where business_account_id = $1
          and id = $2
          and revoked_at_utc is null
      `,
      [businessAccountId, sessionId, reason, now],
    );
    return (result.rowCount ?? 0) === 1;
  }

  public async revokeUserSessions(
    transaction: TransactionContext,
    businessAccountId: string,
    userId: string,
    reason: string,
    now: Date,
  ): Promise<number> {
    const result = await transaction.sql.query(
      `
        update identity.staff_sessions
        set revoked_at_utc = $4, revocation_reason = $3
        where business_account_id = $1
          and user_id = $2
          and revoked_at_utc is null
      `,
      [businessAccountId, userId, reason, now],
    );
    return result.rowCount ?? 0;
  }

  public async switchActiveBranch(
    transaction: TransactionContext,
    context: StaffRequestContext,
    branchId: string,
  ): Promise<boolean> {
    const result = await transaction.sql.query(
      `
        update identity.staff_sessions s
        set active_branch_id = $3
        where s.business_account_id = $1
          and s.id = $2
          and s.revoked_at_utc is null
          and exists (
            select 1
            from restaurant.employee_branch_access eba
            where eba.business_account_id = s.business_account_id
              and eba.employee_id = $4
              and eba.branch_id = $3
          )
      `,
      [
        context.businessAccountId,
        context.sessionId,
        branchId,
        context.employeeId,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  public async createInvitation(
    transaction: TransactionContext,
    input: CreateInvitationInput,
  ): Promise<
    { readonly invitationId: string; readonly userId: string } | undefined
  > {
    const userResult = await transaction.sql.query<{ id: string }>(
      `
        insert into identity.users (
          id,
          business_account_id,
          employee_id,
          email_normalized,
          status,
          credential_version,
          created_at_utc,
          updated_at_utc
        )
        values ($1, $2, $3, $4, 'invited', 1, $5, $5)
        on conflict (business_account_id, employee_id)
        do update set
          email_normalized = excluded.email_normalized,
          updated_at_utc = excluded.updated_at_utc
        where identity.users.status = 'invited'
        returning id
      `,
      [
        randomUUID(),
        input.businessAccountId,
        input.employeeId,
        input.emailNormalized,
        input.now,
      ],
    );
    const user = userResult.rows[0];
    if (!user) {
      return undefined;
    }

    await transaction.sql.query(
      `
        update identity.staff_invitations
        set revoked_at_utc = $3
        where business_account_id = $1
          and employee_id = $2
          and accepted_at_utc is null
          and revoked_at_utc is null
      `,
      [input.businessAccountId, input.employeeId, input.now],
    );
    await transaction.sql.query(
      `
        insert into identity.staff_invitations (
          id,
          business_account_id,
          employee_id,
          token_hash,
          expires_at_utc,
          created_by_user_id,
          created_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.id,
        input.businessAccountId,
        input.employeeId,
        input.tokenHash,
        input.expiresAtUtc,
        input.createdByUserId,
        input.now,
      ],
    );

    return { invitationId: input.id, userId: user.id };
  }

  public async acceptInvitation(
    transaction: TransactionContext,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<InvitationRecord | undefined> {
    const result = await transaction.sql.query<{
      id: string;
      business_account_id: string;
      employee_id: string;
      user_id: string;
      restaurant_id: string;
    }>(
      `
        with accepted as (
          update identity.staff_invitations i
          set accepted_at_utc = $2
          from restaurant.employees e
          where i.token_hash = $1
            and i.business_account_id = e.business_account_id
            and i.employee_id = e.id
            and e.status = 'active'
            and i.accepted_at_utc is null
            and i.revoked_at_utc is null
            and i.expires_at_utc > $2
          returning i.id, i.business_account_id, i.employee_id, e.restaurant_id
        ),
        activated as (
          update identity.users u
          set
            password_hash = $3,
            status = 'active',
            verified_at_utc = $2,
            credential_version = credential_version + 1,
            updated_at_utc = $2
          from accepted a
          where u.business_account_id = a.business_account_id
            and u.employee_id = a.employee_id
            and u.status = 'invited'
          returning u.id, u.business_account_id, u.employee_id
        )
        select
          a.id,
          a.business_account_id,
          a.employee_id,
          activated.id as user_id,
          a.restaurant_id
        from accepted a
        inner join activated
          on activated.business_account_id = a.business_account_id
          and activated.employee_id = a.employee_id
      `,
      [tokenHash, now, passwordHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          businessAccountId: row.business_account_id,
          employeeId: row.employee_id,
          userId: row.user_id,
          restaurantId: row.restaurant_id,
        }
      : undefined;
  }

  public async createRecoveryToken(
    transaction: TransactionContext,
    input: RecoveryTokenInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        update identity.credential_recovery_tokens
        set used_at_utc = $3
        where business_account_id = $1
          and user_id = $2
          and used_at_utc is null
      `,
      [input.businessAccountId, input.userId, input.now],
    );
    await transaction.sql.query(
      `
        insert into identity.credential_recovery_tokens (
          id,
          business_account_id,
          user_id,
          token_hash,
          expires_at_utc,
          created_at_utc
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.id,
        input.businessAccountId,
        input.userId,
        input.tokenHash,
        input.expiresAtUtc,
        input.now,
      ],
    );
  }

  public async findRecoveryUser(
    sql: SqlExecutor,
    businessCode: string,
    emailNormalized: string,
  ): Promise<UserCredentialRecord | undefined> {
    return this.findCredentialsForLogin(sql, businessCode, emailNormalized);
  }

  public async completeRecovery(
    transaction: TransactionContext,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<UserCredentialRecord | undefined> {
    const result = await transaction.sql.query<CredentialRow>(
      `
        with consumed as (
          update identity.credential_recovery_tokens t
          set used_at_utc = $2
          where t.token_hash = $1
            and t.used_at_utc is null
            and t.expires_at_utc > $2
          returning t.business_account_id, t.user_id
        )
        update identity.users u
        set
          password_hash = $3,
          credential_version = credential_version + 1,
          updated_at_utc = $2
        from consumed c, restaurant.employees e
        where u.business_account_id = c.business_account_id
          and u.id = c.user_id
          and u.status = 'active'
          and e.business_account_id = u.business_account_id
          and e.id = u.employee_id
          and e.status = 'active'
        returning
          u.id,
          u.business_account_id,
          u.employee_id,
          e.restaurant_id,
          u.password_hash,
          u.credential_version,
          u.status
      `,
      [tokenHash, now, passwordHash],
    );
    const row = result.rows[0];
    return row ? mapCredential(row) : undefined;
  }

  public async userForEmployee(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<UserCredentialRecord | undefined> {
    const result = await sql.query<CredentialRow>(
      `
        select
          u.id,
          u.business_account_id,
          u.employee_id,
          e.restaurant_id,
          u.password_hash,
          u.credential_version,
          u.status
        from identity.users u
        inner join restaurant.employees e
          on e.business_account_id = u.business_account_id
          and e.id = u.employee_id
        where u.business_account_id = $1 and u.employee_id = $2
      `,
      [businessAccountId, employeeId],
    );
    const row = result.rows[0];
    return row ? mapCredential(row) : undefined;
  }

  public async isEffectiveAdministrator(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
    requiredPermissions: readonly PermissionKey[],
  ): Promise<boolean> {
    const result = await sql.query<{ permission_count: number }>(
      `
        select count(distinct g.permission_key)::integer as permission_count
        from identity.permission_grants g
        inner join identity.users u
          on u.business_account_id = g.business_account_id
          and u.employee_id = g.employee_id
        inner join restaurant.employees e
          on e.business_account_id = g.business_account_id
          and e.id = g.employee_id
        where g.business_account_id = $1
          and g.employee_id = $2
          and g.permission_key = any($3::text[])
          and g.revoked_at_utc is null
          and u.status = 'active'
          and e.status = 'active'
      `,
      [businessAccountId, employeeId, [...requiredPermissions]],
    );
    return result.rows[0]?.permission_count === requiredPermissions.length;
  }

  public async countEffectiveAdministratorsForUpdate(
    transaction: TransactionContext,
    businessAccountId: string,
    requiredPermissions: readonly PermissionKey[],
  ): Promise<number> {
    await transaction.sql.query(
      `
        select id
        from restaurant.business_accounts
        where id = $1
        for update
      `,
      [businessAccountId],
    );
    const result = await transaction.sql.query<{ administrator_count: number }>(
      `
        select count(*)::integer as administrator_count
        from (
          select g.employee_id
          from identity.permission_grants g
          inner join identity.users u
            on u.business_account_id = g.business_account_id
            and u.employee_id = g.employee_id
          inner join restaurant.employees e
            on e.business_account_id = g.business_account_id
            and e.id = g.employee_id
          where g.business_account_id = $1
            and g.permission_key = any($2::text[])
            and g.revoked_at_utc is null
            and u.status = 'active'
            and e.status = 'active'
          group by g.employee_id
          having count(distinct g.permission_key) = $3
        ) administrators
      `,
      [businessAccountId, [...requiredPermissions], requiredPermissions.length],
    );
    return result.rows[0]?.administrator_count ?? 0;
  }

  public async grantAdministrator(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    restaurantId: string | undefined,
    grantedByUserId: string,
    requiredPermissions: readonly PermissionKey[],
    now: Date,
  ): Promise<void> {
    await this.initializePermissionSet(
      transaction,
      businessAccountId,
      employeeId,
      now,
    );
    let changed = false;
    for (const permissionKey of requiredPermissions) {
      const result = await transaction.sql.query(
        `
          insert into identity.permission_grants (
            id,
            business_account_id,
            employee_id,
            permission_key,
            restaurant_id,
            granted_by_user_id,
            granted_at_utc
          )
          select
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::varchar,
            $5::uuid,
            $6::uuid,
            $7::timestamptz
          where not exists (
            select 1
            from identity.permission_grants
            where business_account_id = $2
              and employee_id = $3
              and permission_key = $4::varchar
              and restaurant_id is not distinct from $5::uuid
              and branch_id is null
              and revoked_at_utc is null
          )
        `,
        [
          randomUUID(),
          businessAccountId,
          employeeId,
          permissionKey,
          restaurantId ?? null,
          grantedByUserId,
          now,
        ],
      );
      changed = changed || (result.rowCount ?? 0) > 0;
    }
    if (changed) {
      await transaction.sql.query(
        `
          update identity.employee_permission_sets
          set version = version + 1, updated_at_utc = $3
          where business_account_id = $1 and employee_id = $2
        `,
        [businessAccountId, employeeId, now],
      );
    }
  }

  public async removeAdministratorGrants(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    requiredPermissions: readonly PermissionKey[],
    now: Date,
  ): Promise<number> {
    const result = await transaction.sql.query(
      `
        update identity.permission_grants
        set revoked_at_utc = $4
        where business_account_id = $1
          and employee_id = $2
          and permission_key = any($3::text[])
          and revoked_at_utc is null
      `,
      [businessAccountId, employeeId, [...requiredPermissions], now],
    );
    if ((result.rowCount ?? 0) > 0) {
      await transaction.sql.query(
        `
          update identity.employee_permission_sets
          set version = version + 1, updated_at_utc = $3
          where business_account_id = $1 and employee_id = $2
        `,
        [businessAccountId, employeeId, now],
      );
    }
    return result.rowCount ?? 0;
  }

  public async disableUserForEmployee(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    now: Date,
  ): Promise<UserCredentialRecord | undefined> {
    const result = await transaction.sql.query<CredentialRow>(
      `
        update identity.users u
        set
          status = 'disabled',
          credential_version = credential_version + 1,
          updated_at_utc = $3
        from restaurant.employees e
        where u.business_account_id = $1
          and u.employee_id = $2
          and e.business_account_id = u.business_account_id
          and e.id = u.employee_id
        returning
          u.id,
          u.business_account_id,
          u.employee_id,
          e.restaurant_id,
          u.password_hash,
          u.credential_version,
          u.status
      `,
      [businessAccountId, employeeId, now],
    );
    const row = result.rows[0];
    return row ? mapCredential(row) : undefined;
  }

  public async initializePermissionSet(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    now: Date,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into identity.employee_permission_sets (
          business_account_id, employee_id, version, updated_at_utc
        )
        values ($1, $2, 1, $3)
        on conflict (business_account_id, employee_id) do nothing
      `,
      [businessAccountId, employeeId, now],
    );
  }

  public async getPermissionSet(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<PermissionSet | undefined> {
    const versionResult = await sql.query<{ version: number }>(
      `
        select version
        from identity.employee_permission_sets
        where business_account_id = $1 and employee_id = $2
      `,
      [businessAccountId, employeeId],
    );
    const version = versionResult.rows[0]?.version;
    if (version === undefined) {
      return undefined;
    }
    const grantResult = await sql.query<GrantRow>(
      `
        select permission_key, restaurant_id, branch_id
        from identity.permission_grants
        where business_account_id = $1
          and employee_id = $2
          and revoked_at_utc is null
        order by permission_key, restaurant_id nulls first, branch_id nulls first
      `,
      [businessAccountId, employeeId],
    );
    const grants: PermissionGrant[] = grantResult.rows.flatMap((row) =>
      isPermissionKey(row.permission_key)
        ? [
            {
              permissionKey: row.permission_key,
              ...(row.restaurant_id ? { restaurantId: row.restaurant_id } : {}),
              ...(row.branch_id ? { branchId: row.branch_id } : {}),
            },
          ]
        : [],
    );
    return { employeeId, version, grants };
  }

  public async replacePermissionSet(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly employeeId: string;
      readonly expectedVersion: number;
      readonly grants: readonly PermissionGrant[];
      readonly grantedByUserId: string;
      readonly now: Date;
    },
  ): Promise<PermissionSet | undefined> {
    const versionResult = await transaction.sql.query<{ version: number }>(
      `
        update identity.employee_permission_sets
        set version = version + 1, updated_at_utc = $4
        where business_account_id = $1
          and employee_id = $2
          and version = $3
        returning version
      `,
      [
        input.businessAccountId,
        input.employeeId,
        input.expectedVersion,
        input.now,
      ],
    );
    const version = versionResult.rows[0]?.version;
    if (version === undefined) {
      return undefined;
    }
    await transaction.sql.query(
      `
        update identity.permission_grants
        set revoked_at_utc = $3
        where business_account_id = $1
          and employee_id = $2
          and revoked_at_utc is null
      `,
      [input.businessAccountId, input.employeeId, input.now],
    );
    for (const grant of input.grants) {
      await transaction.sql.query(
        `
          insert into identity.permission_grants (
            id,
            business_account_id,
            employee_id,
            permission_key,
            restaurant_id,
            branch_id,
            granted_by_user_id,
            granted_at_utc
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          randomUUID(),
          input.businessAccountId,
          input.employeeId,
          grant.permissionKey,
          grant.restaurantId ?? null,
          grant.branchId ?? null,
          input.grantedByUserId,
          input.now,
        ],
      );
    }
    return {
      employeeId: input.employeeId,
      version,
      grants: input.grants,
    };
  }

  public async listPermissionTemplates(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly PermissionTemplate[]> {
    const result = await sql.query<{
      template_key: string;
      display_name: string;
      permission_keys: unknown;
      version: number;
      active: boolean;
    }>(
      `
        select t.template_key, t.display_name, t.permission_keys,
          coalesce(s.version, t.version) as version,
          coalesce(s.active, t.active) as active
        from identity.permission_templates t
        left join identity.permission_template_states s
          on s.business_account_id = $1
         and s.restaurant_id = $2
         and s.template_key = t.template_key
        order by t.template_key
      `,
      [businessAccountId, restaurantId],
    );
    return result.rows.map((row) => ({
      key: row.template_key,
      displayName: row.display_name,
      permissionKeys: Array.isArray(row.permission_keys)
        ? row.permission_keys.filter(
            (value): value is PermissionKey =>
              typeof value === "string" && isPermissionKey(value),
          )
        : [],
      version: row.version,
      active: row.active,
    }));
  }

  public async deactivatePermissionTemplate(
    transaction: TransactionContext,
    input: {
      readonly stateId: string;
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly templateKey: string;
      readonly expectedVersion: number;
      readonly updatedByUserId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<PermissionTemplateStateChange | undefined> {
    const result = await transaction.sql.query<{
      state_id: string;
      template_key: string;
      display_name: string;
      permission_keys: unknown;
      active: boolean;
      version: number;
    }>(
      `
        with base as (
          select template_key, display_name, permission_keys, version, active
          from identity.permission_templates
          where template_key = $4
            and version = $5
            and active = true
        ),
        changed as (
          insert into identity.permission_template_states (
            id, business_account_id, restaurant_id, template_key,
            active, version,
            updated_by_user_id, reason, updated_at_utc
          )
          select $1, $2, $3, base.template_key, false, base.version + 1,
            $6, $7, $8
          from base
          on conflict (business_account_id, restaurant_id, template_key)
          do update set
            active = false,
            version = identity.permission_template_states.version + 1,
            updated_by_user_id = excluded.updated_by_user_id,
            reason = excluded.reason,
            updated_at_utc = excluded.updated_at_utc
          where identity.permission_template_states.active = true
            and identity.permission_template_states.version = $5
          returning id as state_id, template_key, active, version
        )
        select changed.state_id, base.template_key, base.display_name,
          base.permission_keys, changed.active, changed.version
        from base
        join changed using (template_key)
      `,
      [
        input.stateId,
        input.businessAccountId,
        input.restaurantId,
        input.templateKey,
        input.expectedVersion,
        input.updatedByUserId,
        input.reason,
        input.now,
      ],
    );
    const current = result.rows[0];
    if (!current) {
      return undefined;
    }
    return {
      stateId: current.state_id,
      key: current.template_key,
      displayName: current.display_name,
      permissionKeys: Array.isArray(current.permission_keys)
        ? current.permission_keys.filter(
            (value): value is PermissionKey =>
              typeof value === "string" && isPermissionKey(value),
          )
        : [],
      version: current.version,
      active: false,
    };
  }

  public async createSupportAccessGrant(
    transaction: TransactionContext,
    input: CreateSupportAccessGrantInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into identity.support_access_grants (
          id,
          business_account_id,
          operator_id,
          approver_id,
          approval_reference,
          reason,
          scope,
          token_hash,
          created_at_utc,
          expires_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
      `,
      [
        input.id,
        input.businessAccountId,
        input.operatorId,
        input.approverId,
        input.approvalReference,
        input.reason,
        JSON.stringify(input.scope),
        input.tokenHash,
        input.now,
        input.expiresAtUtc,
      ],
    );
  }

  public async getSupportAccessGrant(
    sql: SqlExecutor,
    tokenHash: string,
    now: Date,
  ): Promise<SupportAccessGrant | undefined> {
    const result = await sql.query<{
      id: string;
      business_account_id: string;
      operator_id: string;
      approver_id: string;
      approval_reference: string;
      reason: string;
      scope: CreateSupportAccessGrantInput["scope"];
      expires_at_utc: Date;
    }>(
      `
        select
          id,
          business_account_id,
          operator_id,
          approver_id,
          approval_reference,
          reason,
          scope,
          expires_at_utc
        from identity.support_access_grants
        where token_hash = $1
          and revoked_at_utc is null
          and expires_at_utc > $2
      `,
      [tokenHash, now],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          businessAccountId: row.business_account_id,
          operatorId: row.operator_id,
          approverId: row.approver_id,
          approvalReference: row.approval_reference,
          reason: row.reason,
          scope: row.scope,
          expiresAtUtc: row.expires_at_utc,
        }
      : undefined;
  }

  public async revokeSupportAccessGrant(
    transaction: TransactionContext,
    input: {
      readonly grantId: string;
      readonly operatorId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<SupportAccessGrant | undefined> {
    const result = await transaction.sql.query<{
      id: string;
      business_account_id: string;
      operator_id: string;
      approver_id: string;
      approval_reference: string;
      reason: string;
      scope: CreateSupportAccessGrantInput["scope"];
      expires_at_utc: Date;
    }>(
      `
        update identity.support_access_grants
        set
          revoked_at_utc = $4,
          revoked_by_operator_id = $2,
          revocation_reason = $3
        where id = $1 and revoked_at_utc is null
        returning
          id,
          business_account_id,
          operator_id,
          approver_id,
          approval_reference,
          reason,
          scope,
          expires_at_utc
      `,
      [input.grantId, input.operatorId, input.reason, input.now],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          businessAccountId: row.business_account_id,
          operatorId: row.operator_id,
          approverId: row.approver_id,
          approvalReference: row.approval_reference,
          reason: row.reason,
          scope: row.scope,
          expiresAtUtc: row.expires_at_utc,
        }
      : undefined;
  }

  public async listEligibleNotificationRecipients(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId?: string;
      readonly permissionKey: PermissionKey;
    },
  ): Promise<readonly NotificationRecipient[]> {
    const result = await sql.query<{
      user_id: string;
      employee_id: string;
    }>(
      `
        select distinct u.id as user_id, u.employee_id
        from identity.users u
        join restaurant.employees e
          on e.business_account_id = u.business_account_id
         and e.id = u.employee_id
        join restaurant.restaurants r
          on r.business_account_id = e.business_account_id
         and r.id = e.restaurant_id
        join restaurant.business_accounts ba
          on ba.id = u.business_account_id
        join identity.permission_grants g
          on g.business_account_id = u.business_account_id
         and g.employee_id = u.employee_id
         and g.revoked_at_utc is null
        where u.business_account_id = $1
          and u.status = 'active'
          and e.status = 'active'
          and r.status = 'active'
          and ba.status = 'active'
          and e.restaurant_id = $2
          and g.permission_key = $4
          and (g.restaurant_id is null or g.restaurant_id = $2)
          and (
            ($3::uuid is null and g.branch_id is null)
            or (
              $3::uuid is not null
              and (g.branch_id is null or g.branch_id = $3)
            )
          )
          and exists (
            select 1
            from restaurant.employee_branch_access eba
            join restaurant.branches b
              on b.business_account_id = eba.business_account_id
             and b.id = eba.branch_id
            where eba.business_account_id = u.business_account_id
              and eba.employee_id = u.employee_id
              and ($3::uuid is null or eba.branch_id = $3)
              and b.restaurant_id = $2
              and b.status = 'active'
          )
        order by u.id
      `,
      [
        input.businessAccountId,
        input.restaurantId,
        input.branchId ?? null,
        input.permissionKey,
      ],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      employeeId: row.employee_id,
    }));
  }
}
