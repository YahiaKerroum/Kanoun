import {
  createDatabasePool,
  hashOpaqueToken,
  pingDatabase,
  type DatabasePool,
} from "@rms/building-blocks";
import {
  createGuestSessionMiddleware,
  createIdentityAccessRouter,
  createKitchenRouter,
  createMenuRouter,
  createOrderingRouter,
  createPaymentsRouter,
  createPublicMenuRouter,
  createPublicTablesRouter,
  createRestaurantConfigurationRouter,
  createStaffSessionMiddleware,
  createTablesRouter,
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresMenuStore,
  PostgresKitchenStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
} from "@rms/modules";
import {
  KitchenServingService,
  MenuTablesService,
  OrderSubmissionService,
  PaymentCompletionService,
  PostgresServiceWorkflow,
  TenantOwnerService,
} from "@rms/service-workflow";
import { createApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { WebhookCredentialTokenDelivery } from "./credential-token-delivery.js";
import { createLogger } from "./logging.js";
import { createTenantBootstrapRouter } from "./platform-routes/tenant-bootstrap-router.js";
import { createSupportAccessRouter } from "./platform-routes/support-access-router.js";

export interface ApiComposition {
  readonly app: ReturnType<typeof createApp>;
  readonly databasePool: DatabasePool;
}

export function composeApi(config: ApiConfig): ApiComposition {
  const logger = createLogger(config.logLevel);
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-api",
  });
  const identitySecurity = new IdentitySecurity(config.sessionSecret);
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const menu = new PostgresMenuStore();
  const tables = new PostgresTablesStore();
  const ordering = new PostgresOrderingStore();
  const kitchen = new PostgresKitchenStore();
  const payments = new PostgresPaymentsStore();
  const audit = new PostgresAuditWriter();
  const workflow = new PostgresServiceWorkflow(databasePool);
  const credentialTokenDelivery = new WebhookCredentialTokenDelivery({
    ...(config.recoveryDeliveryUrl
      ? { deliveryUrl: config.recoveryDeliveryUrl }
      : {}),
    ...(config.recoveryDeliverySecret
      ? { deliverySecret: config.recoveryDeliverySecret }
      : {}),
  });
  const tenantOwnerService = new TenantOwnerService({
    databasePool,
    workflow,
    restaurantConfiguration,
    identityAccess,
    identitySecurity,
    audit,
    credentialTokenDelivery,
  });
  const menuTablesService = new MenuTablesService({
    databasePool,
    workflow,
    menu,
    tables,
    ordering,
    restaurantConfiguration,
    audit,
    guestAccessSecret: config.guestAccessSecret,
    customerWebOrigin: config.customerWebOrigin,
  });
  const orderSubmissionService = new OrderSubmissionService({
    databasePool,
    workflow,
    restaurantConfiguration,
    menu,
    tables,
    ordering,
    kitchen,
    audit,
    idempotencySecret: config.guestAccessSecret,
  });
  const kitchenServingService = new KitchenServingService({
    databasePool,
    workflow,
    restaurantConfiguration,
    kitchen,
    ordering,
    audit,
    idempotencySecret: config.guestAccessSecret,
  });
  const paymentCompletionService = new PaymentCompletionService({
    databasePool,
    workflow,
    restaurantConfiguration,
    menu,
    tables,
    ordering,
    kitchen,
    payments,
    audit,
    idempotencySecret: config.guestAccessSecret,
  });
  const sessionDependencies = {
    authenticateSession: (token: string) =>
      tenantOwnerService.authenticateSession(token),
    hashCsrfToken: (token: string) => identitySecurity.hashToken(token),
    webOrigin: config.webOrigin,
  };
  const guestSessionDependencies = {
    authenticateGuestSession: (token: string) =>
      menuTablesService.authenticateGuestSession(token),
    hashCsrfToken: (token: string) =>
      hashOpaqueToken(token, config.guestAccessSecret),
    guestWebOrigin: config.customerWebOrigin,
  };
  const identityRouter = createIdentityAccessRouter({
    ...sessionDependencies,
    useCases: tenantOwnerService,
    secureCookies: config.sessionCookieSecure,
  });
  const restaurantRouter = createRestaurantConfigurationRouter({
    ...sessionDependencies,
    useCases: tenantOwnerService,
  });
  const menuRouter = createMenuRouter({
    ...sessionDependencies,
    useCases: menuTablesService,
  });
  const tablesRouter = createTablesRouter({
    ...sessionDependencies,
    useCases: menuTablesService,
  });
  const publicMenuRouter = createPublicMenuRouter({
    useCases: menuTablesService,
  });
  const publicTablesRouter = createPublicTablesRouter({
    useCases: menuTablesService,
    secureCookies: config.sessionCookieSecure,
  });
  const orderingRouter = createOrderingRouter({
    ...sessionDependencies,
    ...guestSessionDependencies,
    useCases: orderSubmissionService,
    servingUseCases: kitchenServingService,
    paymentCompletionUseCases: paymentCompletionService,
  });
  const paymentsRouter = createPaymentsRouter({
    ...sessionDependencies,
    useCases: paymentCompletionService,
  });
  const kitchenRouter = createKitchenRouter({
    ...sessionDependencies,
    useCases: kitchenServingService,
  });
  const bootstrapRouter = createTenantBootstrapRouter({
    bootstrapSecret: config.bootstrapSecret,
    bootstrapTenant: (input, metadata) =>
      tenantOwnerService.bootstrapTenant(input, metadata),
  });
  const supportAccessRouter = createSupportAccessRouter({
    supportAccessSecret: config.supportAccessSecret,
    useCases: tenantOwnerService,
  });

  const app = createApp({
    logger,
    trustProxy: config.trustProxy,
    checkReadiness: () => pingDatabase(databasePool),
    staffSessionMiddleware: createStaffSessionMiddleware(sessionDependencies),
    guestSessionMiddleware: createGuestSessionMiddleware(
      guestSessionDependencies,
    ),
    apiRouters: [
      bootstrapRouter,
      supportAccessRouter,
      identityRouter,
      restaurantRouter,
      menuRouter,
      tablesRouter,
      publicMenuRouter,
      publicTablesRouter,
      orderingRouter,
      kitchenRouter,
      paymentsRouter,
    ],
  });

  return {
    app,
    databasePool,
  };
}
