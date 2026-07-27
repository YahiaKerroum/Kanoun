import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "@rms/building-blocks";
import {
  administratorPermissionKeys,
  ApplicationError,
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresRestaurantConfigurationStore,
} from "@rms/modules";
import { PostgresServiceWorkflow } from "./postgres-service-workflow.js";
import {
  TenantOwnerService,
  type CredentialTokenDelivery,
  type TenantBootstrapResult,
} from "./tenant-owner-service.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

function metadata() {
  const correlationId = randomUUID();
  return {
    correlationId,
    causationId: correlationId,
    now: new Date("2026-07-27T15:00:00.000Z"),
  };
}

function bootstrapInput(code: string) {
  return {
    businessCode: code,
    businessName: `${code} Hospitality`,
    restaurantName: `${code} Kitchen`,
    branch: {
      name: "Central branch",
      address: {
        line1: "12 Test Street",
        city: "Algiers",
        countryCode: "DZ",
      },
      contact: {
        email: `branch-${code}@example.test`,
        phone: "+213555010101",
      },
      timeZone: "Africa/Algiers",
      currency: "DZD",
      openingHours: [
        { dayOfWeek: 0, opensAt: "18:00", closesAt: "02:00" },
        { dayOfWeek: 1, opensAt: "18:00", closesAt: "23:00" },
      ],
    },
    owner: {
      displayName: `${code} Owner`,
      email: `owner-${code}@example.test`,
      password: "Correct-Horse-42",
    },
  } as const;
}

describeWithDatabase("tenant, branch, and owner bootstrap", () => {
  if (!connectionString) {
    return;
  }

  const databasePool = createDatabasePool({
    connectionString,
    applicationName: "rms-slice-002-integration-test",
    maximumConnections: 8,
  });
  const workflow = new PostgresServiceWorkflow(databasePool);
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const identitySecurity = new IdentitySecurity(
    "slice-002-test-token-secret-with-32-characters",
  );
  const deliveredRecoveryTokens: string[] = [];
  const tokenDelivery: CredentialTokenDelivery = {
    deliverRecoveryToken(input) {
      deliveredRecoveryTokens.push(input.token);
      return Promise.resolve();
    },
  };
  const service = new TenantOwnerService({
    databasePool,
    workflow,
    restaurantConfiguration,
    identityAccess,
    identitySecurity,
    audit: new PostgresAuditWriter(),
    credentialTokenDelivery: tokenDelivery,
  });

  let first: TenantBootstrapResult;
  let second: TenantBootstrapResult;
  let firstCode: string;
  let secondCode: string;

  beforeAll(async () => {
    firstCode = `first-${randomUUID().slice(0, 8)}`;
    secondCode = `second-${randomUUID().slice(0, 8)}`;
    first = await service.bootstrapTenant(
      bootstrapInput(firstCode),
      metadata(),
    );
    second = await service.bootstrapTenant(
      bootstrapInput(secondCode),
      metadata(),
    );
  });

  afterAll(async () => {
    await databasePool.end();
  });

  it("commits the tenant, owner, branch, audit, and outbox atomically", async () => {
    const result = await databasePool.query<{
      business_accounts: number;
      restaurants: number;
      branches: number;
      employees: number;
      users: number;
      grants: number;
      audits: number;
      events: number;
    }>(
      `
        select
          (select count(*)::integer from restaurant.business_accounts where id = $1) as business_accounts,
          (select count(*)::integer from restaurant.restaurants where business_account_id = $1) as restaurants,
          (select count(*)::integer from restaurant.branches where business_account_id = $1) as branches,
          (select count(*)::integer from restaurant.employees where business_account_id = $1) as employees,
          (select count(*)::integer from identity.users where business_account_id = $1) as users,
          (select count(*)::integer from identity.permission_grants where business_account_id = $1 and revoked_at_utc is null) as grants,
          (select count(*)::integer from audit.audit_events where business_account_id = $1) as audits,
          (select count(*)::integer from platform.outbox_messages where business_account_id = $1) as events
      `,
      [first.businessAccountId],
    );

    expect(result.rows[0]).toEqual({
      business_accounts: 1,
      restaurants: 1,
      branches: 1,
      employees: 1,
      users: 1,
      grants: administratorPermissionKeys.length,
      audits: 1,
      events: 1,
    });
    expect(first.branch.openingHours).toContainEqual({
      dayOfWeek: 0,
      opensAt: "18:00",
      closesAt: "02:00",
    });
  });

  it("stores no raw password or session token and revokes logout immediately", async () => {
    const login = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const stored = await databasePool.query<{
      token_hash: string;
      password_hash: string;
    }>(
      `
        select s.token_hash, u.password_hash
        from identity.staff_sessions s
        inner join identity.users u
          on u.business_account_id = s.business_account_id
          and u.id = s.user_id
        where s.id = $1
      `,
      [login.context.sessionId],
    );

    expect(stored.rows[0]?.token_hash).not.toBe(login.sessionToken);
    expect(stored.rows[0]?.password_hash).not.toContain("Correct-Horse-42");
    expect(await service.authenticateSession(login.sessionToken)).toBeDefined();

    await service.logout(login.context, metadata());
    expect(
      await service.authenticateSession(login.sessionToken),
    ).toBeUndefined();
  });

  it("does not disclose whether a login identity exists", async () => {
    const failures = await Promise.allSettled([
      service.login(
        {
          businessCode: firstCode,
          email: `owner-${firstCode}@example.test`,
          password: "wrong-password",
        },
        metadata(),
      ),
      service.login(
        {
          businessCode: firstCode,
          email: "absent@example.test",
          password: "wrong-password",
        },
        metadata(),
      ),
    ]);
    expect(failures).toHaveLength(2);
    for (const failure of failures) {
      expect(failure.status).toBe("rejected");
      if (failure.status === "rejected") {
        expect(failure.reason).toMatchObject({
          code: "authentication_required",
          title: "Authentication failed",
        });
      }
    }
  });

  it("hides valid identifiers from another tenant and unassigned branches", async () => {
    const login = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );

    await expect(
      service.getRestaurant(login.context, second.restaurant.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
      status: 404,
    });
    await expect(
      service.getBranch(login.context, second.branch.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
      status: 404,
    });
    await expect(
      service.switchBranch(login.context, second.branch.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
      status: 404,
    });
  });

  it("rejects stale restaurant updates without writing audit or outbox rows", async () => {
    const login = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const updated = await service.updateRestaurant(
      login.context,
      {
        restaurantId: first.restaurant.id,
        expectedVersion: 1,
        name: "Updated restaurant",
      },
      metadata(),
    );
    expect(updated.version).toBe(2);

    const before = await databasePool.query<{ count: number }>(
      `
        select (
          (select count(*) from audit.audit_events where business_account_id = $1) +
          (select count(*) from platform.outbox_messages where business_account_id = $1)
        )::integer as count
      `,
      [first.businessAccountId],
    );
    await expect(
      service.updateRestaurant(
        login.context,
        {
          restaurantId: first.restaurant.id,
          expectedVersion: 1,
          name: "Stale update",
        },
        metadata(),
      ),
    ).rejects.toMatchObject({
      code: "concurrency_conflict",
      currentVersion: 2,
    });
    const after = await databasePool.query<{ count: number }>(
      `
        select (
          (select count(*) from audit.audit_events where business_account_id = $1) +
          (select count(*) from platform.outbox_messages where business_account_id = $1)
        )::integer as count
      `,
      [first.businessAccountId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("keeps invitations single-use and does not add grants during acceptance", async () => {
    const ownerLogin = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const employeeId = randomUUID();
    await workflow.run((transaction) =>
      restaurantConfiguration.createEmployee(transaction, {
        id: employeeId,
        businessAccountId: first.businessAccountId,
        restaurantId: first.restaurant.id,
        displayName: "Invited Staff",
        email: `staff-${firstCode}@example.test`,
        branchIds: [first.branch.id],
        now: metadata().now,
      }),
    );
    const invitation = await service.inviteStaff(
      ownerLogin.context,
      employeeId,
      metadata(),
    );
    const stored = await databasePool.query<{ token_hash: string }>(
      `
        select token_hash
        from identity.staff_invitations
        where business_account_id = $1 and employee_id = $2
      `,
      [first.businessAccountId, employeeId],
    );
    expect(stored.rows[0]?.token_hash).not.toBe(invitation.invitationToken);

    await service.acceptInvitation(
      invitation.invitationToken,
      "Invited-Staff-42",
      metadata(),
    );
    await expect(
      service.acceptInvitation(
        invitation.invitationToken,
        "Invited-Staff-42",
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      service.inviteStaff(ownerLogin.context, employeeId, metadata()),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    const invitationCount = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from identity.staff_invitations
        where business_account_id = $1 and employee_id = $2
      `,
      [first.businessAccountId, employeeId],
    );
    expect(invitationCount.rows[0]?.count).toBe(1);
    const grants = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from identity.permission_grants
        where business_account_id = $1
          and employee_id = $2
          and revoked_at_utc is null
      `,
      [first.businessAccountId, employeeId],
    );
    expect(grants.rows[0]?.count).toBe(0);

    const staffLogin = await service.login(
      {
        businessCode: firstCode,
        email: `staff-${firstCode}@example.test`,
        password: "Invited-Staff-42",
      },
      metadata(),
    );
    await expect(
      service.listRestaurants(staffLogin.context),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("uses single-use recovery tokens and revokes every existing session", async () => {
    const login = await service.login(
      {
        businessCode: secondCode,
        email: `owner-${secondCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const deliveryCount = deliveredRecoveryTokens.length;
    await service.requestRecovery(
      {
        businessCode: secondCode,
        email: `owner-${secondCode}@example.test`,
      },
      metadata(),
    );
    const token = deliveredRecoveryTokens[deliveryCount];
    expect(token).toBeTypeOf("string");
    if (token === undefined) {
      throw new Error("Expected a recovery token to be delivered.");
    }
    const stored = await databasePool.query<{ token_hash: string }>(
      `
        select token_hash
        from identity.credential_recovery_tokens
        where business_account_id = $1
        order by created_at_utc desc
        limit 1
      `,
      [second.businessAccountId],
    );
    expect(stored.rows[0]?.token_hash).not.toBe(token);

    await service.completeRecovery(token, "Recovered-Owner-42", metadata());
    expect(
      await service.authenticateSession(login.sessionToken),
    ).toBeUndefined();
    await expect(
      service.completeRecovery(token, "Recovered-Again-42", metadata()),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("serializes concurrent final-administrator removals and audits blocked attempts", async () => {
    const ownerLogin = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const attempts = await Promise.allSettled([
      service.removeAdministrator(
        ownerLogin.context,
        first.employeeId,
        "Concurrent administrator removal test",
        metadata(),
      ),
      service.removeAdministrator(
        ownerLogin.context,
        first.employeeId,
        "Concurrent administrator removal test",
        metadata(),
      ),
    ]);
    expect(attempts.every((attempt) => attempt.status === "rejected")).toBe(
      true,
    );
    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        expect(attempt.reason).toBeInstanceOf(ApplicationError);
        expect(attempt.reason).toMatchObject({
          code: "invalid_state_transition",
        });
      }
    }
    const evidence = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from audit.audit_events
        where business_account_id = $1
          and action = 'identity.last_administrator_removal_blocked'
          and outcome = 'failed'
      `,
      [first.businessAccountId],
    );
    expect(evidence.rows[0]?.count).toBeGreaterThanOrEqual(2);
    expect(
      await identityAccess.isEffectiveAdministrator(
        databasePool,
        first.businessAccountId,
        first.employeeId,
        administratorPermissionKeys,
      ),
    ).toBe(true);
  });

  it("audits and blocks a final administrator transfer to the same employee", async () => {
    const ownerLogin = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );

    await expect(
      service.transferAdministrator(
        ownerLogin.context,
        first.employeeId,
        true,
        "Self-transfer must not remove the final administrator",
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });

    const evidence = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from audit.audit_events
        where business_account_id = $1
          and action = 'identity.administrator_transfer_blocked'
          and outcome = 'failed'
      `,
      [first.businessAccountId],
    );
    expect(evidence.rows[0]?.count).toBeGreaterThanOrEqual(1);
    expect(
      await identityAccess.isEffectiveAdministrator(
        databasePool,
        first.businessAccountId,
        first.employeeId,
        administratorPermissionKeys,
      ),
    ).toBe(true);
  });

  it("filters scoped restaurant and branch grants and denies tenant-wide creation", async () => {
    const code = `scoped-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const login = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const siblingRestaurant = await service.createRestaurant(
      login.context,
      { name: "Sibling restaurant" },
      metadata(),
    );
    const siblingBranch = await service.createBranch(
      login.context,
      {
        restaurantId: siblingRestaurant.id,
        name: "Sibling branch",
        address: {
          line1: "18 Sibling Street",
          city: "Algiers",
          countryCode: "DZ",
        },
        contact: { email: `sibling-${code}@example.test` },
        timeZone: "Africa/Algiers",
        currency: "DZD",
        openingHours: [],
      },
      metadata(),
    );
    await workflow.run((transaction) =>
      restaurantConfiguration.grantEmployeeBranchAccess(
        transaction,
        tenant.businessAccountId,
        tenant.employeeId,
        siblingBranch.id,
        metadata().now,
      ),
    );
    await databasePool.query(
      `
        update identity.permission_grants
        set restaurant_id = $2
        where business_account_id = $1
          and restaurant_id is null
          and permission_key in (
            'restaurant.view',
            'restaurant.edit',
            'branches.view',
            'branches.manage',
            'employees.manage',
            'employees.manage_permissions'
          )
      `,
      [tenant.businessAccountId, tenant.restaurant.id],
    );
    const scopedContext = await service.authenticateSession(login.sessionToken);
    expect(scopedContext).toBeDefined();
    if (!scopedContext) {
      throw new Error("Expected the scoped staff session to remain active.");
    }

    await expect(
      service.createRestaurant(
        scopedContext,
        { name: "Unauthorized tenant-wide restaurant" },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied" });
    await expect(
      service.getRestaurant(scopedContext, siblingRestaurant.id),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(await service.listRestaurants(scopedContext)).toEqual([
      tenant.restaurant,
    ]);
    expect(await service.listBranches(scopedContext)).toEqual([tenant.branch]);
  });

  it("activates a replacement before transfer and revokes the prior administrator session", async () => {
    const ownerLogin = await service.login(
      {
        businessCode: firstCode,
        email: `owner-${firstCode}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const replacementId = randomUUID();
    await workflow.run((transaction) =>
      restaurantConfiguration.createEmployee(transaction, {
        id: replacementId,
        businessAccountId: first.businessAccountId,
        restaurantId: first.restaurant.id,
        displayName: "Replacement Administrator",
        email: `replacement-${firstCode}@example.test`,
        branchIds: [first.branch.id],
        now: metadata().now,
      }),
    );
    const invitation = await service.inviteStaff(
      ownerLogin.context,
      replacementId,
      metadata(),
    );
    await service.acceptInvitation(
      invitation.invitationToken,
      "Replacement-Admin-42",
      metadata(),
    );
    await service.transferAdministrator(
      ownerLogin.context,
      replacementId,
      true,
      "Transfer tenant administration for test",
      metadata(),
    );

    expect(
      await service.authenticateSession(ownerLogin.sessionToken),
    ).toBeUndefined();
    expect(
      await identityAccess.isEffectiveAdministrator(
        databasePool,
        first.businessAccountId,
        replacementId,
        administratorPermissionKeys,
      ),
    ).toBe(true);
    expect(
      await identityAccess.isEffectiveAdministrator(
        databasePool,
        first.businessAccountId,
        first.employeeId,
        administratorPermissionKeys,
      ),
    ).toBe(false);
  });

  it("atomically deactivates employee identity and revokes every session", async () => {
    const code = `deactivate-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const ownerLogin = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const employeeId = randomUUID();
    await workflow.run((transaction) =>
      restaurantConfiguration.createEmployee(transaction, {
        id: employeeId,
        businessAccountId: tenant.businessAccountId,
        restaurantId: tenant.restaurant.id,
        displayName: "Deactivation Subject",
        email: `deactivate-staff-${code}@example.test`,
        branchIds: [tenant.branch.id],
        now: metadata().now,
      }),
    );
    const invitation = await service.inviteStaff(
      ownerLogin.context,
      employeeId,
      metadata(),
    );
    await service.acceptInvitation(
      invitation.invitationToken,
      "Deactivate-Staff-42",
      metadata(),
    );
    const staffLogin = await service.login(
      {
        businessCode: code,
        email: `deactivate-staff-${code}@example.test`,
        password: "Deactivate-Staff-42",
      },
      metadata(),
    );

    await service.deactivateEmployee(
      ownerLogin.context,
      employeeId,
      1,
      "Employee no longer works at this restaurant",
      metadata(),
    );

    expect(
      await service.authenticateSession(staffLogin.sessionToken),
    ).toBeUndefined();
    const state = await databasePool.query<{
      employee_status: string;
      user_status: string;
      revoked_at_utc: Date | null;
    }>(
      `
        select
          e.status as employee_status,
          u.status as user_status,
          s.revoked_at_utc
        from restaurant.employees e
        inner join identity.users u
          on u.business_account_id = e.business_account_id
          and u.employee_id = e.id
        inner join identity.staff_sessions s
          on s.business_account_id = u.business_account_id
          and s.user_id = u.id
        where e.business_account_id = $1
          and e.id = $2
          and s.id = $3
      `,
      [tenant.businessAccountId, employeeId, staffLogin.context.sessionId],
    );
    expect(state.rows[0]).toMatchObject({
      employee_status: "inactive",
      user_status: "disabled",
    });
    expect(state.rows[0]?.revoked_at_utc).toBeInstanceOf(Date);
  });

  it("prevents updates and deletes to append-only audit history", async () => {
    await expect(
      databasePool.query(
        `
          update audit.audit_events
          set action = 'tampered'
          where business_account_id = $1
        `,
        [first.businessAccountId],
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      databasePool.query(
        `
          delete from audit.audit_events
          where business_account_id = $1
        `,
        [first.businessAccountId],
      ),
    ).rejects.toThrow(/append-only/);
  });

  it("creates loginless employees with isolated branch employment and default feature configuration", async () => {
    const code = `workforce-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const employee = await service.createEmployee(
      owner.context,
      {
        restaurantId: tenant.restaurant.id,
        displayName: "No Portal Employee",
        email: `no-portal-${code}@example.test`,
        branchIds: [tenant.branch.id],
      },
      metadata(),
    );

    expect(employee.branchIds).toEqual([tenant.branch.id]);
    expect(
      await service.listEmployees(owner.context, tenant.restaurant.id),
    ).toContainEqual(employee);
    expect(
      await identityAccess.userForEmployee(
        databasePool,
        tenant.businessAccountId,
        employee.id,
      ),
    ).toBeUndefined();
    const configuration = await service.getFeatureConfiguration(
      owner.context,
      tenant.branch.id,
    );
    expect(configuration.configuration.values).toMatchObject({
      "CFG-005": "enabled",
      "CFG-008": "automatic",
      "CFG-009": "disabled",
    });
    await expect(
      service.getPortalCapabilities(owner.context, second.branch.id),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("copies templates, allows later customization, and revokes live sessions after permission changes", async () => {
    const code = `permissions-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const employee = await service.createEmployee(
      owner.context,
      {
        restaurantId: tenant.restaurant.id,
        displayName: "Template Employee",
        email: `template-${code}@example.test`,
        branchIds: [tenant.branch.id],
      },
      metadata(),
    );
    const applied = await service.applyPermissionTemplate(
      owner.context,
      employee.id,
      "general_staff",
      1,
      "Assign general staff responsibilities",
      metadata(),
    );
    expect(applied.grants.map((grant) => grant.permissionKey)).toContain(
      "orders.create",
    );

    const invitation = await service.inviteStaff(
      owner.context,
      employee.id,
      metadata(),
    );
    await service.acceptInvitation(
      invitation.invitationToken,
      "Template-Staff-42",
      metadata(),
    );
    const staff = await service.login(
      {
        businessCode: code,
        email: `template-${code}@example.test`,
        password: "Template-Staff-42",
      },
      metadata(),
    );
    const capabilities = await service.getPortalCapabilities(
      staff.context,
      tenant.branch.id,
    );
    expect(capabilities.permissions).toEqual(
      expect.arrayContaining(["orders.view", "orders.create", "kitchen.view"]),
    );
    expect(capabilities.enabledFeatures).toEqual(
      expect.arrayContaining(["ordering", "kitchen"]),
    );
    const customized = await service.replaceEmployeePermissions(
      owner.context,
      employee.id,
      applied.version,
      applied.grants.filter((grant) => grant.permissionKey !== "orders.create"),
      "Remove order creation responsibility",
      metadata(),
    );
    expect(customized.grants.map((grant) => grant.permissionKey)).not.toContain(
      "orders.create",
    );
    expect(
      await service.authenticateSession(staff.sessionToken),
    ).toBeUndefined();
  });

  it("rejects permission and branch delegation beyond the actor's own authority without partial writes", async () => {
    const code = `delegation-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const employee = await service.createEmployee(
      owner.context,
      {
        restaurantId: tenant.restaurant.id,
        displayName: "Delegation Target",
        email: `delegation-${code}@example.test`,
        branchIds: [tenant.branch.id],
      },
      metadata(),
    );
    const limitedContext = {
      ...owner.context,
      grants: owner.context.grants.filter((grant) =>
        [
          "employees.view",
          "employees.manage",
          "employees.manage_permissions",
          "orders.view",
        ].includes(grant.permissionKey),
      ),
    };
    await expect(
      service.replaceEmployeePermissions(
        limitedContext,
        employee.id,
        1,
        [
          {
            permissionKey: "payments.refund",
            restaurantId: tenant.restaurant.id,
            branchId: tenant.branch.id,
          },
        ],
        "Attempt privilege escalation",
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(
      await service.getEmployeePermissions(owner.context, employee.id),
    ).toMatchObject({ version: 1, grants: [] });
    await expect(
      service.createEmployee(
        owner.context,
        {
          restaurantId: tenant.restaurant.id,
          displayName: "Wrong Tenant Branch",
          email: `wrong-tenant-${code}@example.test`,
          branchIds: [second.branch.id],
        },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("validates feature dependencies and stale versions without appending partial evidence", async () => {
    const code = `features-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    await expect(
      service.updateFeatureConfiguration(
        owner.context,
        {
          branchId: tenant.branch.id,
          expectedVersion: 1,
          changes: { "CFG-005": "disabled" },
          confirmAffectedWorkflows: true,
          reason: "Test invalid dependent workflow",
        },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    const changed = await service.updateFeatureConfiguration(
      owner.context,
      {
        branchId: tenant.branch.id,
        expectedVersion: 1,
        changes: {
          "CFG-007": "disabled",
          "CFG-011": "disabled",
          "CFG-005": "disabled",
        },
        confirmAffectedWorkflows: true,
        reason: "Pause ordering and every dependent workflow",
      },
      metadata(),
    );
    expect(changed.version).toBe(2);
    const capabilities = await service.getPortalCapabilities(
      owner.context,
      tenant.branch.id,
    );
    expect(capabilities.enabledFeatures).not.toEqual(
      expect.arrayContaining(["ordering", "kitchen", "payments"]),
    );
    const restored = await service.updateFeatureConfiguration(
      owner.context,
      {
        branchId: tenant.branch.id,
        expectedVersion: 2,
        changes: {
          "CFG-005": "enabled",
          "CFG-007": "enabled",
          "CFG-011": "enabled",
        },
        confirmAffectedWorkflows: true,
        reason: "Restore ordering and dependent workflows",
      },
      metadata(),
    );
    expect(restored.version).toBe(3);
    expect(
      (await service.getPortalCapabilities(owner.context, tenant.branch.id))
        .enabledFeatures,
    ).toEqual(expect.arrayContaining(["ordering", "kitchen", "payments"]));
    await expect(
      service.updateFeatureConfiguration(
        owner.context,
        {
          branchId: tenant.branch.id,
          expectedVersion: 1,
          changes: { "CFG-013": "disabled" },
          confirmAffectedWorkflows: true,
          reason: "Use a deliberately stale version",
        },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "concurrency_conflict" });
    const versions = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from restaurant.feature_configuration_versions
        where business_account_id = $1 and branch_id = $2
      `,
      [tenant.businessAccountId, tenant.branch.id],
    );
    expect(versions.rows[0]?.count).toBe(3);
  });

  it("keeps support access deny-by-default, hashed, audited, scoped, and immediately revocable", async () => {
    const code = `support-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const operatorId = randomUUID();
    const grant = await service.createSupportAccess(
      {
        businessAccountId: tenant.businessAccountId,
        operatorId,
        approverId: randomUUID(),
        approvalReference: "support-approval-1042",
        reason: "Investigate tenant configuration incident",
        permissionKeys: ["restaurant.view", "branches.view"],
        restaurantIds: [tenant.restaurant.id],
        branchIds: [tenant.branch.id],
        expiresAtUtc: new Date("2026-07-27T16:00:00.000Z"),
      },
      metadata(),
    );
    const stored = await databasePool.query<{
      token_hash: string;
      approval_reference: string;
    }>(
      `
        select token_hash, approval_reference
        from identity.support_access_grants
        where id = $1
      `,
      [grant.grantId],
    );
    expect(stored.rows[0]?.token_hash).not.toBe(grant.accessToken);
    expect(stored.rows[0]?.approval_reference).toBe("support-approval-1042");
    const snapshot = await service.inspectTenantWithSupportAccess(
      grant.accessToken,
      tenant.businessAccountId,
      metadata(),
    );
    expect(snapshot.restaurants.map((item) => item.id)).toEqual([
      tenant.restaurant.id,
    ]);
    await service.revokeSupportAccess(
      grant.grantId,
      operatorId,
      "Incident review is complete",
      metadata(),
    );
    await expect(
      service.inspectTenantWithSupportAccess(
        grant.accessToken,
        tenant.businessAccountId,
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "authentication_required" });
    const audits = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from audit.audit_events
        where business_account_id = $1 and action like 'support.%'
      `,
      [tenant.businessAccountId],
    );
    expect(audits.rows[0]?.count).toBe(3);

    await expect(
      service.createSupportAccess(
        {
          businessAccountId: tenant.businessAccountId,
          operatorId,
          approverId: operatorId,
          approvalReference: "self-approved-incident",
          reason: "Attempt a self-approved support grant",
          permissionKeys: ["restaurant.view"],
          restaurantIds: [tenant.restaurant.id],
          branchIds: [],
          expiresAtUtc: new Date("2026-07-27T16:00:00.000Z"),
        },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("preserves the final administrator during direct permission replacement", async () => {
    const code = `permission-admin-${randomUUID().slice(0, 8)}`;
    const tenant = await service.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await service.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: "Correct-Horse-42",
      },
      metadata(),
    );
    const current = await service.getEmployeePermissions(
      owner.context,
      tenant.employeeId,
    );
    await expect(
      service.replaceEmployeePermissions(
        owner.context,
        tenant.employeeId,
        current.version,
        [],
        "Attempt to remove final administrator permissions",
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(
      await identityAccess.isEffectiveAdministrator(
        databasePool,
        tenant.businessAccountId,
        tenant.employeeId,
        administratorPermissionKeys,
      ),
    ).toBe(true);
  });
});
