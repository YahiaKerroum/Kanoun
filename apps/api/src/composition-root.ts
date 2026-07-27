import {
  createDatabasePool,
  pingDatabase,
  type DatabasePool,
} from "@rms/building-blocks";
import {
  createIdentityAccessRouter,
  createRestaurantConfigurationRouter,
  createStaffSessionMiddleware,
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresRestaurantConfigurationStore,
} from "@rms/modules";
import {
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
  const sessionDependencies = {
    authenticateSession: (token: string) =>
      tenantOwnerService.authenticateSession(token),
    hashCsrfToken: (token: string) => identitySecurity.hashToken(token),
    webOrigin: config.webOrigin,
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
    apiRouters: [
      bootstrapRouter,
      supportAccessRouter,
      identityRouter,
      restaurantRouter,
    ],
  });

  return {
    app,
    databasePool,
  };
}
