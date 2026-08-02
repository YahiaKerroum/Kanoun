import {
  Bell,
  BriefcaseBusiness,
  ChefHat,
  ClipboardList,
  CreditCard,
  History,
  House,
  Menu as MenuIcon,
  MonitorCheck,
  PackageOpen,
  RefreshCw,
  Settings,
  KeyRound,
  TableProperties,
  Users,
  UserRound,
  Wrench,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useState,
  type ComponentType,
} from "react";
import { z } from "zod";
import { checkApiReadiness, type Readiness } from "./health.js";
import { MenuWorkspace, TablesWorkspace } from "./OperationalWorkspaces.js";
import { KitchenWorkspace } from "./KitchenWorkspace.js";
import { OrdersWorkspace } from "./OrdersWorkspace.js";
import { PaymentsWorkspace } from "./PaymentsWorkspace.js";
import {
  AuditWorkspace,
  DashboardWorkspace,
  NotificationInboxWorkspace,
  SalesReportWorkspace,
} from "./InsightsWorkspaces.js";

type Section =
  | "Home"
  | "Orders"
  | "Tables"
  | "Kitchen"
  | "Payments"
  | "Menu"
  | "Stock"
  | "Staff"
  | "Reports"
  | "Setup"
  | "Audit"
  | "Notifications";

interface NavigationItem {
  readonly label: Section;
  readonly icon: ComponentType<LucideProps>;
  readonly group: "service" | "maintain" | "review";
  readonly requiredFeature?: string;
  readonly permissionPrefixes?: readonly string[];
  readonly permissions?: readonly string[];
}

const navigationItems: readonly NavigationItem[] = [
  { label: "Home", icon: House, group: "service" },
  {
    label: "Notifications",
    icon: Bell,
    group: "service",
    requiredFeature: "notifications",
  },
  {
    label: "Orders",
    icon: ClipboardList,
    group: "service",
    requiredFeature: "ordering",
    permissionPrefixes: ["orders."],
  },
  {
    label: "Tables",
    icon: TableProperties,
    group: "service",
    requiredFeature: "tables",
    permissionPrefixes: ["tables."],
  },
  {
    label: "Kitchen",
    icon: ChefHat,
    group: "service",
    requiredFeature: "kitchen",
    permissionPrefixes: ["kitchen."],
    permissions: ["orders.serve"],
  },
  {
    label: "Payments",
    icon: CreditCard,
    group: "service",
    requiredFeature: "payments",
    permissionPrefixes: ["payments."],
  },
  {
    label: "Menu",
    icon: MenuIcon,
    group: "maintain",
    requiredFeature: "menu",
    permissionPrefixes: ["menu."],
  },
  {
    label: "Stock",
    icon: PackageOpen,
    group: "maintain",
    requiredFeature: "inventory",
  },
  {
    label: "Staff",
    icon: Users,
    group: "maintain",
    requiredFeature: "identity_access",
    permissionPrefixes: ["employees."],
  },
  {
    label: "Reports",
    icon: MonitorCheck,
    group: "review",
    requiredFeature: "reporting",
    permissionPrefixes: ["reports."],
  },
  {
    label: "Setup",
    icon: Settings,
    group: "review",
    requiredFeature: "restaurant_configuration",
    permissions: ["restaurant.edit", "branches.manage", "features.manage"],
  },
  {
    label: "Audit",
    icon: History,
    group: "review",
    requiredFeature: "audit",
    permissions: ["audit.view"],
  },
];

const sessionSchema = z.object({
  employeeId: z.uuid(),
  activeBranchId: z.uuid().nullable(),
  authorizedBranchIds: z.array(z.uuid()),
  grants: z.array(
    z.object({
      permissionKey: z.string(),
      restaurantId: z.uuid().optional(),
      branchId: z.uuid().optional(),
    }),
  ),
  expiresAt: z.iso.datetime(),
});

const capabilitiesSchema = z.object({
  branchId: z.uuid(),
  branchName: z.string().min(1),
  restaurantId: z.uuid(),
  timeZone: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  permissions: z.array(z.string()),
  enabledFeatures: z.array(z.string()),
  configurationVersion: z.number().int().positive(),
});

type StaffSession = z.infer<typeof sessionSchema>;
type PortalCapabilities = z.infer<typeof capabilitiesSchema>;

type PortalState =
  | { readonly kind: "loading" }
  | { readonly kind: "signed-out" }
  | {
      readonly kind: "no-branch";
      readonly session: StaffSession;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: string;
    }
  | {
      readonly kind: "ready";
      readonly session: StaffSession;
      readonly capabilities: PortalCapabilities;
    };

class PortalRequestError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PortalRequestError";
  }
}

async function requestJson<Output>(
  path: string,
  schema: z.ZodType<Output>,
  signal: AbortSignal,
): Promise<Output> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new PortalRequestError(
      response.status,
      response.status === 401
        ? "Your staff session is no longer active."
        : "The staff access boundary could not be loaded.",
    );
  }
  return schema.parse(await response.json());
}

async function loadPortal(signal: AbortSignal): Promise<PortalState> {
  try {
    const session = await requestJson(
      "/api/v1/auth/session",
      sessionSchema,
      signal,
    );
    const branchId =
      session.activeBranchId ?? session.authorizedBranchIds[0] ?? null;
    if (!branchId) {
      return { kind: "no-branch", session };
    }
    const capabilities = await requestJson(
      `/api/v1/staff/branches/${branchId}/capabilities`,
      capabilitiesSchema,
      signal,
    );
    return { kind: "ready", session, capabilities };
  } catch (error) {
    if (error instanceof PortalRequestError && error.status === 401) {
      return { kind: "signed-out" };
    }
    throw error;
  }
}

function formatCheckedAt(readiness: Readiness): string {
  if (readiness.kind === "checking") {
    return "Checking connection";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(readiness.checkedAt);
}

function ReadinessMark({ readiness }: { readonly readiness: Readiness }) {
  const statusText =
    readiness.kind === "ready"
      ? "Connected"
      : readiness.kind === "checking"
        ? "Checking"
        : "Connection not verified";

  return (
    <span className={`readiness-mark readiness-mark--${readiness.kind}`}>
      <span className="readiness-mark__dot" aria-hidden="true" />
      {statusText}
    </span>
  );
}

function isNavigationItemAvailable(
  item: NavigationItem,
  capabilities: PortalCapabilities,
): boolean {
  if (
    item.requiredFeature &&
    !capabilities.enabledFeatures.includes(item.requiredFeature)
  ) {
    return false;
  }
  const requiresPermission =
    (item.permissions?.length ?? 0) > 0 ||
    (item.permissionPrefixes?.length ?? 0) > 0;
  if (!requiresPermission) {
    return true;
  }
  return capabilities.permissions.some(
    (permission) =>
      item.permissions?.includes(permission) === true ||
      item.permissionPrefixes?.some((prefix) =>
        permission.startsWith(prefix),
      ) === true,
  );
}

export function App() {
  const [activeSection, setActiveSection] = useState<Section>("Home");
  const [portal, setPortal] = useState<PortalState>({ kind: "loading" });
  const [readiness, setReadiness] = useState<Readiness>({ kind: "checking" });
  const [refreshSequence, setRefreshSequence] = useState(0);
  const statusId = useId();

  useEffect(() => {
    const abortController = new AbortController();
    setReadiness({ kind: "checking" });
    setPortal({ kind: "loading" });

    void Promise.all([
      checkApiReadiness(abortController.signal).then((result) => {
        if (!abortController.signal.aborted) {
          setReadiness(result);
        }
      }),
      loadPortal(abortController.signal).then((result) => {
        if (!abortController.signal.aborted) {
          setPortal(result);
        }
      }),
    ]).catch((error: unknown) => {
      if (abortController.signal.aborted) {
        return;
      }
      setPortal({
        kind: "unavailable",
        reason:
          error instanceof z.ZodError
            ? "The server returned an invalid staff capability response."
            : error instanceof Error
              ? error.message
              : "The staff access boundary could not be loaded.",
      });
    });

    return () => abortController.abort();
  }, [refreshSequence]);

  const selectSection = useCallback((section: Section) => {
    startTransition(() => setActiveSection(section));
  }, []);

  const refresh = useCallback(() => {
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  if (portal.kind !== "ready") {
    return <AccessBoundary portal={portal} onRetry={refresh} />;
  }

  const availableNavigation = navigationItems.filter((item) =>
    isNavigationItemAvailable(item, portal.capabilities),
  );
  const visibleSection = availableNavigation.some(
    (item) => item.label === activeSection,
  )
    ? activeSection
    : "Home";
  const activeRestaurantId = portal.capabilities.restaurantId;
  const notificationsAvailable = availableNavigation.some(
    (item) => item.label === "Notifications",
  );

  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <div className="app-stage">
        <div className="app-frame">
          <aside className="navigation-rail" aria-label="Staff navigation">
            <div
              className="brand-lockup"
              aria-label="MISE working product name"
            >
              <span className="brand-mark" aria-hidden="true">
                <ChefHat size={23} />
              </span>
              <span>MISE</span>
            </div>

            <nav
              className="navigation-rail__items"
              aria-label="Staff navigation"
            >
              {availableNavigation.map((item, index) => {
                const Icon = item.icon;
                const previousGroup = availableNavigation[index - 1]?.group;
                const startsGroup = index > 0 && previousGroup !== item.group;
                const isActive = visibleSection === item.label;

                return (
                  <button
                    className={`navigation-item${
                      isActive ? " navigation-item--active" : ""
                    }${startsGroup ? " navigation-item--group-start" : ""}`}
                    type="button"
                    key={item.label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => selectSection(item.label)}
                  >
                    <Icon aria-hidden="true" size={21} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="rail-profile">
              <span className="rail-profile__avatar" aria-hidden="true">
                <UserRound size={19} />
              </span>
              <span className="visually-hidden">
                Authenticated employee {portal.session.employeeId}
              </span>
            </div>
          </aside>

          <div className="application">
            <header className="context-bar">
              <div className="context-bar__title">
                <p>Staff workspace</p>
                <h1>{visibleSection}</h1>
              </div>
              <div className="context-item">
                <span className="context-item__label">Branch</span>
                <strong title={`Branch ID: ${portal.capabilities.branchId}`}>
                  {portal.capabilities.branchName}
                </strong>
              </div>
              <div className="context-item">
                <span className="context-item__label">Access</span>
                <strong>
                  {availableNavigation.length} destination
                  {availableNavigation.length === 1 ? "" : "s"}
                </strong>
              </div>
              <div className="context-item context-item--connection">
                <ReadinessMark readiness={readiness} />
                <span className="context-item__label">
                  Checked {formatCheckedAt(readiness)}
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh staff access and API readiness"
                aria-describedby={statusId}
                disabled={readiness.kind === "checking"}
                onClick={refresh}
              >
                <RefreshCw
                  aria-hidden="true"
                  size={20}
                  className={readiness.kind === "checking" ? "is-spinning" : ""}
                />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Open notifications"
                aria-pressed={visibleSection === "Notifications"}
                disabled={!notificationsAvailable}
                onClick={() => selectSection("Notifications")}
              >
                <Bell aria-hidden="true" size={20} />
              </button>
            </header>

            <main id="workspace" className="workspace" tabIndex={-1}>
              {visibleSection === "Home" ? (
                <HomeWorkspace
                  capabilities={portal.capabilities}
                  destinationCount={availableNavigation.length}
                  readiness={readiness}
                  statusId={statusId}
                  branchId={portal.capabilities.branchId}
                  canViewReports={portal.capabilities.permissions.includes(
                    "reports.view",
                  )}
                />
              ) : visibleSection === "Notifications" ? (
                <NotificationInboxWorkspace
                  branchId={portal.capabilities.branchId}
                />
              ) : visibleSection === "Orders" ? (
                <OrdersWorkspace
                  branchId={portal.capabilities.branchId}
                  restaurantId={activeRestaurantId}
                  employeeId={portal.session.employeeId}
                  canView={portal.capabilities.permissions.includes(
                    "orders.view",
                  )}
                  canCreate={portal.capabilities.permissions.includes(
                    "orders.create",
                  )}
                  canViewMenu={portal.capabilities.permissions.includes(
                    "menu.view",
                  )}
                  canViewTables={portal.capabilities.permissions.includes(
                    "tables.view",
                  )}
                  canModify={portal.capabilities.permissions.includes(
                    "orders.modify",
                  )}
                  canCancel={portal.capabilities.permissions.includes(
                    "orders.cancel",
                  )}
                  canComplete={portal.capabilities.permissions.includes(
                    "orders.complete",
                  )}
                  canCompleteUnpaid={portal.capabilities.permissions.includes(
                    "orders.complete_unpaid",
                  )}
                  canAssignTables={portal.capabilities.permissions.includes(
                    "tables.assign",
                  )}
                />
              ) : visibleSection === "Kitchen" ? (
                <KitchenWorkspace
                  branchId={portal.capabilities.branchId}
                  canView={portal.capabilities.permissions.includes(
                    "kitchen.view",
                  )}
                  canUpdate={portal.capabilities.permissions.includes(
                    "kitchen.update",
                  )}
                  canServe={portal.capabilities.permissions.includes(
                    "orders.serve",
                  )}
                />
              ) : visibleSection === "Payments" ? (
                <PaymentsWorkspace
                  branchId={portal.capabilities.branchId}
                  canView={portal.capabilities.permissions.includes(
                    "payments.view",
                  )}
                  canRecord={portal.capabilities.permissions.includes(
                    "payments.record",
                  )}
                  canRefund={portal.capabilities.permissions.includes(
                    "payments.refund",
                  )}
                />
              ) : visibleSection === "Menu" ? (
                <MenuWorkspace
                  restaurantId={activeRestaurantId}
                  canView={portal.capabilities.permissions.includes(
                    "menu.view",
                  )}
                />
              ) : visibleSection === "Tables" ? (
                <TablesWorkspace
                  branchId={portal.capabilities.branchId}
                  canView={portal.capabilities.permissions.includes(
                    "tables.view",
                  )}
                />
              ) : visibleSection === "Reports" ? (
                <SalesReportWorkspace
                  branchId={portal.capabilities.branchId}
                  timeZone={portal.capabilities.timeZone}
                  canView={portal.capabilities.permissions.includes(
                    "reports.view",
                  )}
                />
              ) : visibleSection === "Audit" ? (
                <AuditWorkspace
                  restaurantId={activeRestaurantId}
                  branchId={portal.capabilities.branchId}
                  canView={portal.capabilities.permissions.includes(
                    "audit.view",
                  )}
                />
              ) : (
                <DeferredWorkspace section={visibleSection} />
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

function AccessBoundary({
  portal,
  onRetry,
}: {
  readonly portal: Exclude<PortalState, { readonly kind: "ready" }>;
  readonly onRetry: () => void;
}) {
  const content =
    portal.kind === "loading"
      ? {
          eyebrow: "AUTHENTICATING STAFF ACCESS",
          title: "Resolving your branch workspace…",
          detail:
            "Navigation appears only after the server resolves your current branch, permissions, and enabled features.",
        }
      : portal.kind === "signed-out"
        ? {
            eyebrow: "PROTECTED STAFF PORTAL",
            title: "Staff access required",
            detail:
              "Sign in with an active staff account before opening branch tools. No tenant or branch is selected from browser input.",
          }
        : portal.kind === "no-branch"
          ? {
              eyebrow: "ASSIGNMENT REQUIRED",
              title: "No branch workspace is assigned",
              detail:
                "An administrator must assign this employee to an active branch before operational navigation can be resolved.",
            }
          : {
              eyebrow: "ACCESS COULD NOT BE VERIFIED",
              title: "The staff workspace is unavailable",
              detail: portal.reason,
            };

  return (
    <div className="app-stage access-stage">
      <main className="access-boundary" aria-live="polite">
        <span className="brand-mark" aria-hidden="true">
          <ChefHat size={23} />
        </span>
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        {portal.kind === "unavailable" ? (
          <button type="button" onClick={onRetry}>
            Retry access check
          </button>
        ) : null}
      </main>
    </div>
  );
}

function HomeWorkspace({
  capabilities,
  destinationCount,
  readiness,
  statusId,
  branchId,
  canViewReports,
}: {
  readonly capabilities: PortalCapabilities;
  readonly destinationCount: number;
  readonly readiness: Readiness;
  readonly statusId: string;
  readonly branchId: string;
  readonly canViewReports: boolean;
}) {
  const apiReady = readiness.kind === "ready";

  return (
    <div className="workspace__content">
      <section className="launch-banner" aria-labelledby="launch-title">
        <div>
          <p className="eyebrow">SERVICE OVERVIEW</p>
          <h2 id="launch-title">Your branch is ready for service.</h2>
          <p>
            Orders, tables, menu, kitchen, payments, and reporting tools are
            tailored to the responsibilities assigned to you.
          </p>
        </div>
        <div className="launch-banner__status" id={statusId} role="status">
          <ReadinessMark readiness={readiness} />
          <span>
            {apiReady
              ? "Service access and API readiness were verified."
              : readiness.kind === "checking"
                ? "Refreshing service access and API readiness."
                : "Service access loaded, but API readiness is not verified."}
          </span>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="workspace-panel" aria-labelledby="access-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TODAY'S ACCESS</p>
              <h2 id="access-title">Your workspace</h2>
            </div>
            <span className="panel-count">
              v{capabilities.configurationVersion}
            </span>
          </div>
          <ul className="check-list">
            <li>
              <span className="access-icon" aria-hidden="true">
                <BriefcaseBusiness size={19} strokeWidth={2.25} />
              </span>
              <div>
                <strong>{destinationCount} available workspaces</strong>
                <span>Only tools available to this branch are shown.</span>
              </div>
              <span className="state-label state-label--ready">Ready</span>
            </li>
            <li>
              <span className="access-icon" aria-hidden="true">
                <KeyRound size={19} strokeWidth={2.25} />
              </span>
              <div>
                <strong>
                  {capabilities.permissions.length} active permissions
                </strong>
                <span>Responsibilities are confirmed for this session.</span>
              </div>
              <span className="state-label state-label--ready">Effective</span>
            </li>
            <li>
              <span className="access-icon" aria-hidden="true">
                <Wrench size={19} strokeWidth={2.25} />
              </span>
              <div>
                <strong>
                  {capabilities.enabledFeatures.length} active services
                </strong>
                <span>Branch tools are configured for service.</span>
              </div>
              <span className="state-label state-label--ready">Current</span>
            </li>
          </ul>
        </section>

        <section className="workspace-panel" aria-labelledby="boundary-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SERVICE STATUS</p>
              <h2 id="boundary-title">Ready for operations</h2>
            </div>
            <span className="slice-number">Open</span>
          </div>
          <p className="panel-copy">
            Work through the branch tools available to you, from orders and
            tables to kitchen flow, payments, reports, and audit evidence.
          </p>
          <dl className="scope-list">
            <div>
              <dt>Available</dt>
              <dd>Tools and data scoped to your branch responsibilities</dd>
            </div>
            <div>
              <dt>Need access?</dt>
              <dd>Contact a branch administrator to update your assignment.</dd>
            </div>
          </dl>
        </section>

        <section
          className="workspace-panel workspace-panel--accent"
          aria-labelledby="design-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SERVICE STANDARD</p>
              <h2 id="design-title">Made for service</h2>
            </div>
            <ChefHat aria-hidden="true" size={26} />
          </div>
          <p className="panel-copy">
            A clear saffron frame, calm working surface, and compact navigation
            keep the team focused through every service period.
          </p>
          <span className="working-name">MISE staff workspace</span>
        </section>
      </div>
      <DashboardWorkspace branchId={branchId} canView={canViewReports} />
    </div>
  );
}

function DeferredWorkspace({ section }: { readonly section: Section }) {
  return (
    <section className="deferred-state" aria-labelledby="deferred-title">
      <span className="deferred-state__icon" aria-hidden="true">
        <ClipboardList size={28} />
      </span>
      <p className="eyebrow">
        AUTHORIZED DESTINATION · DELIVERY ORDER PROTECTED
      </p>
      <h2 id="deferred-title">
        {section} is available but not implemented here yet
      </h2>
      <p>
        Your effective branch access permits this destination. Its real data,
        states, automatic actions, and task workflows arrive only in the slice
        that owns the module.
      </p>
    </section>
  );
}
