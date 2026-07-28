import { randomUUID } from "node:crypto";
import type { DatabasePool, TransactionContext } from "@rms/building-blocks";
import {
  appendOutboxMessage,
  createOpaqueToken,
  hashOpaqueToken,
} from "@rms/building-blocks";
import {
  ApplicationError,
  guestSessionAbsoluteTimeoutMs,
  hasPermission,
  isGuestSessionValid,
  isPricingConfigurationValid,
  type AuditWriter,
  type BranchDishOverride,
  type Category,
  type CustomerMenu,
  type Dish,
  type ExchangeQrResult,
  type GuestRequestContext,
  type IssuedQrCode,
  type MenuStore,
  type OptionGroup,
  type OrderingStore,
  type PermissionKey,
  type RestaurantConfigurationStore,
  type StaffRequestContext,
  type Table,
  type TableQrCode,
  type TablesStore,
} from "@rms/modules";
import type { PostgresServiceWorkflow } from "./postgres-service-workflow.js";

export interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
  readonly now?: Date;
}

export interface MenuTablesServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly menu: MenuStore;
  readonly tables: TablesStore;
  readonly ordering: OrderingStore;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly audit: AuditWriter;
  readonly guestAccessSecret: string;
  readonly customerWebOrigin: string;
}

function nowFrom(metadata: RequestMetadata): Date {
  return metadata.now ?? new Date();
}

function requirePermission(
  context: StaffRequestContext,
  permission: PermissionKey,
  restaurantId: string,
  branchId?: string,
): void {
  if (!hasPermission(context, permission, restaurantId, branchId)) {
    throw new ApplicationError("permission_denied", 403, "Permission denied");
  }
}

function notFound(resource: string): never {
  throw new ApplicationError(
    "resource_not_found",
    404,
    `${resource} not found`,
  );
}

function rethrowTableCodeConflict(error: unknown): never {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  const constraint =
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
      ? error.constraint
      : undefined;
  if (code === "23505" && constraint === "table_branch_code_uidx") {
    throw new ApplicationError(
      "validation_error",
      409,
      "Table code already exists",
      "Use a different table code for this branch.",
    );
  }
  throw error;
}

export class MenuTablesService {
  public constructor(
    private readonly dependencies: MenuTablesServiceDependencies,
  ) {}

  // ---------------------------------------------------------------------
  // Menu — categories
  // ---------------------------------------------------------------------

  public async listCategories(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<readonly Category[]> {
    requirePermission(
      context,
      "menu.view",
      restaurantId,
      context.activeBranchId,
    );
    return this.dependencies.menu.listCategories(
      this.dependencies.databasePool,
      context.businessAccountId,
      restaurantId,
    );
  }

  public async createCategory(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly name: string;
      readonly displayOrder: number;
    },
    metadata: RequestMetadata,
  ): Promise<Category> {
    requirePermission(context, "menu.manage", input.restaurantId);
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.createCategory(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        restaurantId: input.restaurantId,
        name: input.name,
        displayOrder: input.displayOrder,
        now,
      }),
    );
  }

  public async updateCategory(
    context: StaffRequestContext,
    input: {
      readonly categoryId: string;
      readonly expectedVersion: number;
      readonly name?: string | undefined;
      readonly displayOrder?: number | undefined;
      readonly status?: "active" | "inactive" | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<Category> {
    const before = await this.dependencies.menu.getCategory(
      this.dependencies.databasePool,
      context.businessAccountId,
      input.categoryId,
    );
    if (!before) {
      notFound("Category");
    }
    requirePermission(context, "menu.manage", before.restaurantId);
    const now = nowFrom(metadata);
    const category = await this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.updateCategory(transaction, {
        businessAccountId: context.businessAccountId,
        categoryId: input.categoryId,
        expectedVersion: input.expectedVersion,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        now,
      }),
    );
    if (!category) {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Category changed",
        "Reload the category and retry the change.",
        before.version,
      );
    }
    return category;
  }

  // ---------------------------------------------------------------------
  // Menu — dishes
  // ---------------------------------------------------------------------

  public async listDishes(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<readonly Dish[]> {
    requirePermission(
      context,
      "menu.view",
      restaurantId,
      context.activeBranchId,
    );
    return this.dependencies.menu.listDishes(
      this.dependencies.databasePool,
      context.businessAccountId,
      restaurantId,
    );
  }

  public async createDish(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly categoryId: string;
      readonly name: string;
      readonly description?: string | undefined;
      readonly imageUrl?: string | undefined;
      readonly basePrice: {
        readonly amount: string;
        readonly currency: string;
      };
      readonly displayOrder: number;
    },
    metadata: RequestMetadata,
  ): Promise<Dish> {
    requirePermission(context, "menu.manage", input.restaurantId);
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.createDish(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        restaurantId: input.restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        basePrice: input.basePrice,
        displayOrder: input.displayOrder,
        now,
      }),
    );
  }

  public async updateDish(
    context: StaffRequestContext,
    input: {
      readonly dishId: string;
      readonly expectedVersion: number;
      readonly name?: string | undefined;
      readonly description?: string | null | undefined;
      readonly imageUrl?: string | null | undefined;
      readonly categoryId?: string | undefined;
      readonly displayOrder?: number | undefined;
      readonly basePrice?:
        { readonly amount: string; readonly currency: string } | undefined;
      readonly available?: boolean | undefined;
      readonly status?: "active" | "inactive" | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<Dish> {
    const before = await this.dependencies.menu.getDish(
      this.dependencies.databasePool,
      context.businessAccountId,
      input.dishId,
    );
    if (!before) {
      notFound("Dish");
    }
    requirePermission(context, "menu.manage", before.restaurantId);
    if (input.basePrice) {
      const groups = await this.dependencies.menu.listOptionGroups(
        this.dependencies.databasePool,
        context.businessAccountId,
        input.dishId,
      );
      if (
        !isPricingConfigurationValid(
          input.basePrice,
          groups.map((group) => ({
            minimumSelections: group.minimumSelections,
            options: group.options,
          })),
        )
      ) {
        throw new ApplicationError(
          "validation_error",
          422,
          "This price can produce a negative item price for a valid option selection.",
        );
      }
    }
    const now = nowFrom(metadata);
    const dish = await this.dependencies.workflow.run(async (transaction) => {
      const updated = await this.dependencies.menu.updateDish(transaction, {
        businessAccountId: context.businessAccountId,
        dishId: input.dishId,
        expectedVersion: input.expectedVersion,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        ...(input.basePrice !== undefined
          ? { basePrice: input.basePrice }
          : {}),
        ...(input.available !== undefined
          ? { available: input.available }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        now,
      });
      if (
        updated &&
        input.available !== undefined &&
        input.available !== before.available
      ) {
        await this.appendMenuAvailabilityEvent(transaction, {
          context,
          restaurantId: updated.restaurantId,
          dishId: updated.id,
          aggregateVersion: updated.version,
          available: updated.available,
          metadata,
          now,
        });
      }
      return updated;
    });
    if (!dish) {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Dish changed",
        "Reload the dish and retry the change.",
        before.version,
      );
    }
    return dish;
  }

  // ---------------------------------------------------------------------
  // Menu — option groups & options
  // ---------------------------------------------------------------------

  public async createOptionGroup(
    context: StaffRequestContext,
    input: {
      readonly dishId: string;
      readonly name: string;
      readonly selectionType: "single" | "multiple";
      readonly isRequired: boolean;
      readonly minimumSelections: number;
      readonly maximumSelections: number;
      readonly displayOrder: number;
      readonly options: readonly {
        readonly name: string;
        readonly priceDelta: {
          readonly amount: string;
          readonly currency: string;
        };
        readonly displayOrder: number;
      }[];
    },
    metadata: RequestMetadata,
  ): Promise<OptionGroup> {
    const dish = await this.dependencies.menu.getDish(
      this.dependencies.databasePool,
      context.businessAccountId,
      input.dishId,
    );
    if (!dish) {
      notFound("Dish");
    }
    requirePermission(context, "menu.manage", dish.restaurantId);
    if (
      !isPricingConfigurationValid(dish.basePrice, [
        {
          minimumSelections: input.minimumSelections,
          options: input.options.map((option) => ({
            priceDelta: option.priceDelta,
            status: "active",
          })),
        },
      ])
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "This option configuration can produce a negative item price for a valid selection.",
      );
    }
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.createOptionGroup(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        dishId: input.dishId,
        name: input.name,
        selectionType: input.selectionType,
        isRequired: input.isRequired,
        minimumSelections: input.minimumSelections,
        maximumSelections: input.maximumSelections,
        displayOrder: input.displayOrder,
        options: input.options.map((option) => ({
          id: randomUUID(),
          name: option.name,
          priceDelta: option.priceDelta,
          displayOrder: option.displayOrder,
        })),
        now,
      }),
    );
  }

  public async updateOptionGroup(
    context: StaffRequestContext,
    input: {
      readonly optionGroupId: string;
      readonly expectedVersion: number;
      readonly name?: string | undefined;
      readonly isRequired?: boolean | undefined;
      readonly minimumSelections?: number | undefined;
      readonly maximumSelections?: number | undefined;
      readonly displayOrder?: number | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<OptionGroup> {
    const before = await this.dependencies.menu.getOptionGroup(
      this.dependencies.databasePool,
      context.businessAccountId,
      input.optionGroupId,
    );
    if (!before) {
      notFound("Option group");
    }
    const dish = await this.dependencies.menu.getDish(
      this.dependencies.databasePool,
      context.businessAccountId,
      before.dishId,
    );
    if (!dish) {
      notFound("Dish");
    }
    requirePermission(context, "menu.manage", dish.restaurantId);
    if (input.minimumSelections !== undefined) {
      if (
        !isPricingConfigurationValid(dish.basePrice, [
          {
            minimumSelections: input.minimumSelections,
            options: before.options,
          },
        ])
      ) {
        throw new ApplicationError(
          "validation_error",
          422,
          "This minimum selection count can produce a negative item price.",
        );
      }
    }
    const now = nowFrom(metadata);
    const group = await this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.updateOptionGroup(transaction, {
        businessAccountId: context.businessAccountId,
        optionGroupId: input.optionGroupId,
        expectedVersion: input.expectedVersion,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isRequired !== undefined
          ? { isRequired: input.isRequired }
          : {}),
        ...(input.minimumSelections !== undefined
          ? { minimumSelections: input.minimumSelections }
          : {}),
        ...(input.maximumSelections !== undefined
          ? { maximumSelections: input.maximumSelections }
          : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        now,
      }),
    );
    if (!group) {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Option group changed",
        "Reload the option group and retry the change.",
        before.version,
      );
    }
    return group;
  }

  public async replaceOptions(
    context: StaffRequestContext,
    optionGroupId: string,
    input: {
      readonly options: readonly {
        readonly name: string;
        readonly priceDelta: {
          readonly amount: string;
          readonly currency: string;
        };
        readonly displayOrder: number;
        readonly status: "active" | "inactive";
      }[];
    },
    metadata: RequestMetadata,
  ): Promise<OptionGroup> {
    const before = await this.dependencies.menu.getOptionGroup(
      this.dependencies.databasePool,
      context.businessAccountId,
      optionGroupId,
    );
    if (!before) {
      notFound("Option group");
    }
    const dish = await this.dependencies.menu.getDish(
      this.dependencies.databasePool,
      context.businessAccountId,
      before.dishId,
    );
    if (!dish) {
      notFound("Dish");
    }
    requirePermission(context, "menu.manage", dish.restaurantId);
    if (
      !isPricingConfigurationValid(dish.basePrice, [
        { minimumSelections: before.minimumSelections, options: input.options },
      ])
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "This option configuration can produce a negative item price for a valid selection.",
      );
    }
    const now = nowFrom(metadata);
    const group = await this.dependencies.workflow.run((transaction) =>
      this.dependencies.menu.replaceOptions(transaction, {
        businessAccountId: context.businessAccountId,
        optionGroupId,
        options: input.options.map((option) => ({
          id: randomUUID(),
          name: option.name,
          priceDelta: option.priceDelta,
          displayOrder: option.displayOrder,
          status: option.status,
        })),
        now,
      }),
    );
    if (!group) {
      notFound("Option group");
    }
    return group;
  }

  // ---------------------------------------------------------------------
  // Menu — branch overrides
  // ---------------------------------------------------------------------

  public async upsertBranchOverride(
    context: StaffRequestContext,
    branchId: string,
    dishId: string,
    input: {
      readonly expectedVersion: number;
      readonly price?:
        | { readonly amount: string; readonly currency: string }
        | null
        | undefined;
      readonly available?: boolean | null | undefined;
      readonly visible?: boolean | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<BranchDishOverride> {
    const dish = await this.dependencies.menu.getDish(
      this.dependencies.databasePool,
      context.businessAccountId,
      dishId,
    );
    if (!dish) {
      notFound("Dish");
    }
    if (input.price !== undefined) {
      requirePermission(
        context,
        "menu.manage_prices",
        dish.restaurantId,
        branchId,
      );
    }
    if (input.available !== undefined) {
      requirePermission(
        context,
        "menu.manage_availability",
        dish.restaurantId,
        branchId,
      );
    }
    if (input.price === undefined && input.available === undefined) {
      requirePermission(
        context,
        "menu.manage_prices",
        dish.restaurantId,
        branchId,
      );
    }
    const before = await this.dependencies.menu.getBranchOverride(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
      dishId,
    );
    const now = nowFrom(metadata);
    const effectiveBefore = before?.available ?? dish.available;
    const override = await this.dependencies.workflow.run(
      async (transaction) => {
        const updated = await this.dependencies.menu.upsertBranchOverride(
          transaction,
          {
            businessAccountId: context.businessAccountId,
            branchId,
            dishId,
            expectedVersion: input.expectedVersion,
            ...(input.price !== undefined ? { price: input.price } : {}),
            ...(input.available !== undefined
              ? { available: input.available }
              : {}),
            ...(input.visible !== undefined ? { visible: input.visible } : {}),
            now,
          },
        );
        if (!updated) {
          throw new ApplicationError(
            "concurrency_conflict",
            409,
            "Branch override changed",
            "Reload the branch override and retry the change.",
            before?.version ?? 0,
          );
        }
        const effectiveAfter = updated.available ?? dish.available;
        if (
          input.available !== undefined &&
          effectiveBefore !== effectiveAfter
        ) {
          await this.appendMenuAvailabilityEvent(transaction, {
            context,
            restaurantId: dish.restaurantId,
            branchId,
            dishId,
            aggregateVersion: updated.version,
            available: effectiveAfter,
            metadata,
            now,
          });
        }
        return updated;
      },
    );
    return override;
  }

  // ---------------------------------------------------------------------
  // Guest menu
  // ---------------------------------------------------------------------

  public async getGuestMenu(
    guestContext: GuestRequestContext,
  ): Promise<CustomerMenu> {
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      guestContext.businessAccountId,
      guestContext.branchId,
    );
    if (!branch) {
      notFound("Branch");
    }
    return this.dependencies.menu.getCustomerMenu(
      this.dependencies.databasePool,
      guestContext.businessAccountId,
      guestContext.restaurantId,
      guestContext.branchId,
      branch.currency,
    );
  }

  public async authenticateGuestSession(
    rawToken: string,
  ): Promise<GuestRequestContext | undefined> {
    const tokenHash = hashOpaqueToken(
      rawToken,
      this.dependencies.guestAccessSecret,
    );
    const session =
      await this.dependencies.ordering.findGuestSessionByTokenHash(
        this.dependencies.databasePool,
        tokenHash,
      );
    const now = new Date();
    if (!session || !isGuestSessionValid(session, now)) {
      return undefined;
    }
    await this.dependencies.ordering.touchGuestSession(
      this.dependencies.databasePool,
      session.id,
      now,
    );
    return {
      guestSessionId: session.id,
      businessAccountId: session.businessAccountId,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      tableId: session.tableId,
      displayName: session.displayName,
      expiresAtUtc: session.expiresAtUtc,
    };
  }

  // ---------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------

  public async listTables(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly Table[]> {
    const branch = await this.requireBranch(context, branchId);
    requirePermission(context, "tables.view", branch.restaurantId, branchId);
    return this.dependencies.tables.listTables(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
  }

  public async createTable(
    context: StaffRequestContext,
    branchId: string,
    input: { readonly code: string; readonly area?: string | undefined },
    metadata: RequestMetadata,
  ): Promise<Table> {
    const branch = await this.requireBranch(context, branchId);
    requirePermission(context, "tables.manage", branch.restaurantId, branchId);
    const now = nowFrom(metadata);
    try {
      return await this.dependencies.workflow.run((transaction) =>
        this.dependencies.tables.createTable(transaction, {
          id: randomUUID(),
          businessAccountId: context.businessAccountId,
          branchId,
          code: input.code,
          area: input.area,
          now,
        }),
      );
    } catch (error: unknown) {
      rethrowTableCodeConflict(error);
    }
  }

  public async updateTable(
    context: StaffRequestContext,
    tableId: string,
    input: {
      readonly expectedVersion: number;
      readonly code?: string | undefined;
      readonly area?: string | null | undefined;
      readonly status?: "active" | "inactive" | undefined;
      readonly outOfService?: boolean | undefined;
    },
    metadata: RequestMetadata,
  ): Promise<Table> {
    const before = await this.dependencies.tables.getTable(
      this.dependencies.databasePool,
      context.businessAccountId,
      tableId,
    );
    if (!before) {
      notFound("Table");
    }
    const branch = await this.requireBranch(context, before.branchId);
    requirePermission(
      context,
      "tables.manage",
      branch.restaurantId,
      before.branchId,
    );
    const now = nowFrom(metadata);
    let table: Table | undefined;
    try {
      table = await this.dependencies.workflow.run((transaction) =>
        this.dependencies.tables.updateTable(transaction, {
          businessAccountId: context.businessAccountId,
          tableId,
          expectedVersion: input.expectedVersion,
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.area !== undefined ? { area: input.area } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.outOfService !== undefined
            ? { outOfService: input.outOfService }
            : {}),
          now,
        }),
      );
    } catch (error: unknown) {
      rethrowTableCodeConflict(error);
    }
    if (!table) {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Table changed",
        "Reload the table and retry the change.",
        before.version,
      );
    }
    return table;
  }

  public async issueTableQrCode(
    context: StaffRequestContext,
    tableId: string,
    metadata: RequestMetadata,
  ): Promise<IssuedQrCode> {
    const table = await this.dependencies.tables.getTable(
      this.dependencies.databasePool,
      context.businessAccountId,
      tableId,
    );
    if (!table) {
      notFound("Table");
    }
    const branch = await this.requireBranch(context, table.branchId);
    requirePermission(
      context,
      "qr.manage",
      branch.restaurantId,
      table.branchId,
    );
    const now = nowFrom(metadata);
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(
      rawToken,
      this.dependencies.guestAccessSecret,
    );
    const qrCode = await this.dependencies.workflow.run(async (transaction) => {
      const issued = await this.dependencies.tables.issueQrCode(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        branchId: table.branchId,
        tableId: table.id,
        kind: "table",
        tokenHash,
        now,
      });
      await this.appendQrAudit(transaction, {
        context,
        branchId: table.branchId,
        qrCodeId: issued.id,
        action: "qr_code.issued",
        metadata,
        now,
      });
      return issued;
    });
    return {
      qrCode,
      rawToken,
      qrUrl: `${this.dependencies.customerWebOrigin}/qr/${rawToken}`,
    };
  }

  public async issueBranchQrCode(
    context: StaffRequestContext,
    branchId: string,
    metadata: RequestMetadata,
  ): Promise<IssuedQrCode> {
    const branch = await this.requireBranch(context, branchId);
    requirePermission(context, "qr.manage", branch.restaurantId, branchId);
    const now = nowFrom(metadata);
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(
      rawToken,
      this.dependencies.guestAccessSecret,
    );
    const qrCode = await this.dependencies.workflow.run(async (transaction) => {
      const issued = await this.dependencies.tables.issueQrCode(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        branchId,
        kind: "branch",
        tokenHash,
        now,
      });
      await this.appendQrAudit(transaction, {
        context,
        branchId,
        qrCodeId: issued.id,
        action: "qr_code.issued",
        metadata,
        now,
      });
      return issued;
    });
    return {
      qrCode,
      rawToken,
      qrUrl: `${this.dependencies.customerWebOrigin}/qr/${rawToken}`,
    };
  }

  public async revokeQrCode(
    context: StaffRequestContext,
    qrCodeId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<TableQrCode> {
    const before = await this.dependencies.tables.getQrCode(
      this.dependencies.databasePool,
      context.businessAccountId,
      qrCodeId,
    );
    if (!before) {
      notFound("QR code");
    }
    const branch = await this.requireBranch(context, before.branchId);
    requirePermission(
      context,
      "qr.manage",
      branch.restaurantId,
      before.branchId,
    );
    const now = nowFrom(metadata);
    const qrCode = await this.dependencies.workflow.run(async (transaction) => {
      const revoked = await this.dependencies.tables.revokeQrCode(
        transaction,
        context.businessAccountId,
        qrCodeId,
        reason,
        now,
      );
      if (revoked) {
        await this.appendQrAudit(transaction, {
          context,
          branchId: before.branchId,
          qrCodeId,
          action: "qr_code.revoked",
          reason,
          metadata,
          now,
        });
      }
      return revoked;
    });
    if (!qrCode) {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "QR code already revoked",
      );
    }
    return qrCode;
  }

  public async listQrCodes(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly TableQrCode[]> {
    const branch = await this.requireBranch(context, branchId);
    requirePermission(context, "qr.manage", branch.restaurantId, branchId);
    return this.dependencies.tables.listQrCodes(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
  }

  // ---------------------------------------------------------------------
  // Public guest QR exchange
  // ---------------------------------------------------------------------

  public async exchangeTableQr(
    qrToken: string,
    metadata: RequestMetadata,
  ): Promise<ExchangeQrResult> {
    const tokenHash = hashOpaqueToken(
      qrToken,
      this.dependencies.guestAccessSecret,
    );
    const resolved = await this.dependencies.tables.resolveQrToken(
      this.dependencies.databasePool,
      tokenHash,
    );
    if (!resolved) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Resource not found",
      );
    }
    const now = nowFrom(metadata);
    const rawSessionToken = createOpaqueToken();
    const sessionTokenHash = hashOpaqueToken(
      rawSessionToken,
      this.dependencies.guestAccessSecret,
    );
    const absoluteExpiresAtUtc = new Date(
      now.getTime() + guestSessionAbsoluteTimeoutMs,
    );
    const session = await this.dependencies.workflow.run((transaction) =>
      this.dependencies.ordering.createGuestSession(transaction, {
        id: randomUUID(),
        businessAccountId: resolved.businessAccountId,
        restaurantId: resolved.restaurantId,
        branchId: resolved.branchId,
        tableId: resolved.tableId,
        tokenHash: sessionTokenHash,
        now,
        absoluteExpiresAtUtc,
      }),
    );
    return {
      sessionToken: rawSessionToken,
      branchId: resolved.branchId,
      tableId: resolved.tableId,
      tableCode: resolved.tableCode,
      expiresAtUtc: session.expiresAtUtc,
    };
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  private async requireBranch(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{ readonly restaurantId: string }> {
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (!branch) {
      notFound("Branch");
    }
    return branch;
  }

  private async appendQrAudit(
    transaction: TransactionContext,
    input: {
      readonly context: StaffRequestContext;
      readonly branchId: string;
      readonly qrCodeId: string;
      readonly action: string;
      readonly reason?: string;
      readonly metadata: RequestMetadata;
      readonly now: Date;
    },
  ): Promise<void> {
    await this.dependencies.audit.appendInTransaction(transaction, {
      id: randomUUID(),
      businessAccountId: input.context.businessAccountId,
      branchId: input.branchId,
      actorUserId: input.context.userId,
      action: input.action,
      targetType: "table_qr_code",
      targetId: input.qrCodeId,
      outcome: "succeeded",
      ...(input.reason ? { reason: input.reason } : {}),
      correlationId: input.metadata.correlationId,
      occurredAtUtc: input.now,
    });
  }

  private async appendMenuAvailabilityEvent(
    transaction: TransactionContext,
    input: {
      readonly context: StaffRequestContext;
      readonly restaurantId: string;
      readonly branchId?: string;
      readonly dishId: string;
      readonly aggregateVersion: number;
      readonly available: boolean;
      readonly metadata: RequestMetadata;
      readonly now: Date;
    },
  ): Promise<void> {
    await appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType: "menu.availability_changed.v1",
      businessAccountId: input.context.businessAccountId,
      restaurantId: input.restaurantId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      aggregateId: input.dishId,
      aggregateVersion: input.aggregateVersion,
      occurredAtUtc: input.now,
      correlationId: input.metadata.correlationId,
      causationId: input.metadata.causationId,
      actorId: input.context.userId,
      payload: { dishId: input.dishId, available: input.available },
    });
  }
}
