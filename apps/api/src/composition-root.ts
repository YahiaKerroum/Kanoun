import {
  createAlertEvaluator,
  createDatabasePool,
  createLoggingAlertSink,
  createServiceMetrics,
  hashOpaqueToken,
  pingDatabase,
  readPoolSaturation,
  type AlertEvaluator,
  type DatabasePool,
  type ServiceMetrics,
} from "@rms/building-blocks";
import {
  createGuestSessionMiddleware,
  createAuditRouter,
  createIdentityAccessRouter,
  createKitchenRouter,
  createMenuRouter,
  createOrderingRouter,
  createPaymentsRouter,
  createNotificationsRouter,
  createReportingRouter,
  createPublicMenuRouter,
  createPublicTablesRouter,
  createRestaurantConfigurationRouter,
  createStaffSessionMiddleware,
  createTablesRouter,
  IdentitySecurity,
  AuditQueryService,
  NotificationService,
  PostgresAuditReader,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresMenuStore,
  PostgresKitchenStore,
  PostgresNotificationStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresReportingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  ReportingService,
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
  readonly serviceMetrics: ServiceMetrics;
  readonly alertEvaluator: AlertEvaluator;
}

export function composeApi(config: ApiConfig): ApiComposition {
  const logger = createLogger(config.logLevel);
  const serviceMetrics = createServiceMetrics();
  const alertEvaluator = createAlertEvaluator(createLoggingAlertSink(logger));
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-api",
    observation: {
      onQueryComplete: (durationMs) =>
        serviceMetrics.observePoolQuery(durationMs),
      onPoolError: () => serviceMetrics.countPoolError(),
    },
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
  const auditReader = new PostgresAuditReader();
  const notificationStore = new PostgresNotificationStore();
  const reportingStore = new PostgresReportingStore();
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
    ordering,
    tables,
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
    onIdempotentReplay: () =>
      serviceMetrics.countIdempotentDuplicate("order_submission"),
  });
  const kitchenServingService = new KitchenServingService({
    databasePool,
    workflow,
    restaurantConfiguration,
    kitchen,
    ordering,
    audit,
    idempotencySecret: config.guestAccessSecret,
    onIdempotentReplay: () =>
      serviceMetrics.countIdempotentDuplicate("kitchen_serving"),
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
    onIdempotentReplay: () =>
      serviceMetrics.countIdempotentDuplicate("payment_recording"),
  });
  const notificationService = new NotificationService({
    databasePool,
    store: notificationStore,
    identityAccess,
    restaurantConfiguration,
  });
  const reportingService = new ReportingService({
    databasePool,
    store: reportingStore,
    restaurantConfiguration,
  });
  const auditQueryService = new AuditQueryService({
    databasePool,
    reader: auditReader,
  });
  const sessionDependencies = {
    authenticateSession: (token: string) =>
      tenantOwnerService.authenticateSession(token),
    hashCsrfToken: (token: string) => identitySecurity.hashToken(token),
    webOrigin: config.webOrigin,
    webOrigins: [
      config.webOrigin,
      ...(config.staffWebOrigin ? [config.staffWebOrigin] : []),
    ],
  };
  const guestSessionDependencies = {
    authenticateGuestSession: (token: string) =>
      menuTablesService.authenticateGuestSession(token),
    hashGuestCsrfToken: (token: string) =>
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
  const notificationsRouter = createNotificationsRouter({
    ...sessionDependencies,
    useCases: notificationService,
    streamMetrics: {
      connectionOpened: () => serviceMetrics.sseConnectionOpened(),
      connectionClosed: () => serviceMetrics.sseConnectionClosed(),
      reconnected: () => serviceMetrics.sseReconnected(),
      replayGap: () => serviceMetrics.sseReplayGap(),
      sessionEnded: () => serviceMetrics.sseSessionEnded(),
      pollFailure: () => serviceMetrics.ssePollFailure(),
      delivered: (itemAgeMs) => serviceMetrics.sseDelivered(itemAgeMs),
    },
  });
  const reportingRouter = createReportingRouter({
    ...sessionDependencies,
    useCases: reportingService,
  });
  const auditRouter = createAuditRouter({
    ...sessionDependencies,
    useCases: auditQueryService,
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

  const observabilitySampler = setInterval(() => {
    void (async () => {
      serviceMetrics.setPoolSaturation(readPoolSaturation(databasePool));
      try {
        await pingDatabase(databasePool);
        serviceMetrics.setDatabaseReady(true);
      } catch {
        serviceMetrics.setDatabaseReady(false);
      }
      alertEvaluator.evaluate(serviceMetrics.snapshot());
    })();
  }, 15_000);
  observabilitySampler.unref();

  const app = createApp({
    logger,
    trustProxy: config.trustProxy,
    checkReadiness: async () => {
      try {
        await pingDatabase(databasePool);
        serviceMetrics.setDatabaseReady(true);
      } catch (error) {
        serviceMetrics.setDatabaseReady(false);
        throw error;
      }
    },
    serviceMetrics,
    readHealthMetrics: () => {
      const snapshot = serviceMetrics.snapshot();
      return {
        snapshot,
        alerts: alertEvaluator.evaluate(snapshot),
      };
    },
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
      notificationsRouter,
      reportingRouter,
      auditRouter,
    ],
  });

  return {
    app,
    databasePool,
    serviceMetrics,
    alertEvaluator,
  };
}
