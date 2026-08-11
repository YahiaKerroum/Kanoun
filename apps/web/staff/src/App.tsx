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
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
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
import {
  iconButtonVariants,
  navItemVariants,
  sectionContainerVariants,
  staggerContainerVariants,
  fadeUpItemVariants,
} from "./motion.js";
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
import { StaffAuthRoutes } from "./AuthRoutes.js";
import {
  authPath,
  authRouteForPath,
  replaceLocation,
  safeInternalPath,
} from "./auth-navigation.js";
import {
  chooseStaffLanding,
  staffPathForSection,
  staffSectionForPath,
  type StaffSection,
} from "./staff-navigation.js";

type Section = StaffSection | "Stock" | "Staff" | "Setup";

interface NavigationItem {
  readonly label: Section;
  readonly icon: ComponentType<LucideProps>;
  readonly group: "service" | "maintain" | "review";
  readonly requiredFeature?: string;
  readonly permissionPrefixes?: readonly string[];
  readonly permissions?: readonly string[];
  readonly administrationPath?: "/employees" | "/setup";
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
    administrationPath: "/employees",
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
    administrationPath: "/setup",
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
  profile: z
    .object({
      employee: z.object({
        id: z.uuid(),
        displayName: z.string().min(1),
        email: z.email(),
      }),
      restaurant: z.object({ id: z.uuid(), name: z.string().min(1) }),
      activeBranch: z
        .object({ id: z.uuid(), name: z.string().min(1) })
        .nullable(),
    })
    .optional(),
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

const responsibilityLabels: readonly [string, readonly string[]][] = [
  [
    "Restaurant administration",
    ["restaurant.", "branches.", "features.", "employees."],
  ],
  ["Orders", ["orders."]],
  ["Kitchen flow", ["kitchen."]],
  ["Payments", ["payments."]],
  ["Menu and tables", ["menu.", "tables.", "qr."]],
  ["Reports and audit", ["reports.", "audit."]],
  ["Notifications", ["notifications."]],
];

function effectiveResponsibilities(session: StaffSession): readonly string[] {
  const permissions = session.grants.map((grant) => grant.permissionKey);
  return responsibilityLabels
    .filter(([, prefixes]) =>
      permissions.some((permission) =>
        prefixes.some((prefix) => permission.startsWith(prefix)),
      ),
    )
    .map(([label]) => label);
}

function readCsrfCookie(): string {
  return (
    document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("rms_csrf="))
      ?.slice("rms_csrf=".length) ?? ""
  );
}

function canOpenAdministration(session: StaffSession): boolean {
  return session.grants.some((grant) =>
    [
      "restaurant.view",
      "restaurant.edit",
      "branches.view",
      "branches.manage",
      "employees.view",
      "employees.manage",
      "employees.manage_permissions",
      "features.manage",
    ].includes(grant.permissionKey),
  );
}

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

function isStaffSection(section: Section): section is StaffSection {
  return section !== "Stock" && section !== "Staff" && section !== "Setup";
}

export function App() {
  const [portal, setPortal] = useState<PortalState>({ kind: "loading" });
  const [readiness, setReadiness] = useState<Readiness>({ kind: "checking" });
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [locationUrl, setLocationUrl] = useState(
    () =>
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  const [logoutState, setLogoutState] = useState<"idle" | "pending">("idle");
  const [logoutMessage, setLogoutMessage] = useState("");
  const statusId = useId();
  const location = new URL(locationUrl, window.location.origin);
  const locationPath = location.pathname;
  const authRoute = authRouteForPath(locationPath);

  useEffect(() => {
    const synchronizeLocation = () =>
      setLocationUrl(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    window.addEventListener("popstate", synchronizeLocation);
    return () => window.removeEventListener("popstate", synchronizeLocation);
  }, []);

  useEffect(() => {
    if (portal.kind !== "ready" || locationPath !== "/") return;
    const landing = chooseStaffLanding(
      portal.capabilities.permissions,
      portal.capabilities.enabledFeatures,
    );
    if (landing !== "Home") {
      window.history.replaceState({}, "", staffPathForSection(landing));
      setLocationUrl(staffPathForSection(landing));
    }
  }, [locationPath, portal]);

  useEffect(() => {
    if (authRoute) return;
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
  }, [authRoute, refreshSequence]);

  useEffect(() => {
    const handleSessionEnded = () => {
      setPortal({ kind: "signed-out" });
      replaceLocation(
        `${authPath("sign-in")}?notice=session-ended&returnTo=${encodeURIComponent(
          safeInternalPath(
            `${window.location.pathname}${window.location.search}`,
          ),
        )}`,
      );
    };
    window.addEventListener("mise:session-ended", handleSessionEnded);
    return () =>
      window.removeEventListener("mise:session-ended", handleSessionEnded);
  }, []);

  const selectSection = useCallback((section: StaffSection) => {
    startTransition(() => {
      window.history.pushState({}, "", staffPathForSection(section));
      setLocationUrl(staffPathForSection(section));
    });
  }, []);

  const navigateTo = useCallback((href: string) => {
    window.history.pushState({}, "", href);
    setLocationUrl(href);
  }, []);

  const refresh = useCallback(() => {
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  const signOut = useCallback(async () => {
    setLogoutState("pending");
    setLogoutMessage("Signing out…");
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "x-csrf-token": readCsrfCookie(),
        },
      });
      if (response.status === 401) {
        replaceLocation("/auth/sign-in?notice=session-ended");
        return;
      }
      if (!response.ok) {
        setLogoutMessage(
          response.status === 403
            ? "Sign-out could not be verified. Your session remains active."
            : "Sign-out could not be confirmed. Your session remains active.",
        );
        return;
      }
      replaceLocation("/auth/sign-in?notice=signed-out");
    } catch {
      setLogoutMessage(
        "The network could not confirm sign-out. Your session remains active.",
      );
    } finally {
      setLogoutState("idle");
    }
  }, []);

  if (authRoute) return <StaffAuthRoutes route={authRoute} />;

  if (portal.kind !== "ready") {
    return <AccessBoundary portal={portal} onRetry={refresh} />;
  }

  const availableNavigation = navigationItems.filter((item) =>
    isNavigationItemAvailable(item, portal.capabilities),
  );
  const requestedSection = staffSectionForPath(locationPath);
  const requestedItem = navigationItems.find(
    (item) => item.label === requestedSection,
  );
  const landingSection = chooseStaffLanding(
    portal.capabilities.permissions,
    portal.capabilities.enabledFeatures,
  );
  const visibleSection =
    locationPath === "/" ? landingSection : requestedSection;
  const routeState =
    locationPath !== "/" && requestedSection === null
      ? "not-found"
      : requestedSection !== null &&
          requestedItem !== undefined &&
          !isNavigationItemAvailable(requestedItem, portal.capabilities)
        ? "unauthorized"
        : "ready";
  const activeRestaurantId = portal.capabilities.restaurantId;
  const notificationsAvailable = availableNavigation.some(
    (item) => item.label === "Notifications",
  );
  const profile = portal.session.profile ?? {
    employee: {
      id: portal.session.employeeId,
      displayName: "Staff account",
      email: "",
    },
    restaurant: { id: activeRestaurantId, name: "Current restaurant" },
    activeBranch: {
      id: portal.capabilities.branchId,
      name: portal.capabilities.branchName,
    },
  };
  const responsibilities = effectiveResponsibilities(portal.session);
  const administrationOrigin =
    import.meta.env.VITE_ADMIN_WEB_ORIGIN ?? "http://127.0.0.1:5175";
  const isMobilePrimary = (label: Section): boolean =>
    label === "Home" ||
    label === "Orders" ||
    label === "Kitchen" ||
    label === "Payments";
  const renderNavigationItem = (
    item: NavigationItem,
    index: number,
    mobileSecondary = false,
  ) => {
    const Icon = item.icon;
    const previousGroup = availableNavigation[index - 1]?.group;
    const startsGroup = index > 0 && previousGroup !== item.group;
    const isLocal = isStaffSection(item.label);
    const isActive = isLocal && visibleSection === item.label;
    const href = item.administrationPath
      ? `${administrationOrigin}${item.administrationPath}?returnTo=${encodeURIComponent(
          safeInternalPath(`${location.pathname}${location.search}`),
        )}`
      : isLocal
        ? staffPathForSection(item.label)
        : "/";

    return (
      <motion.a
        className={`navigation-item${
          isActive ? " navigation-item--active" : ""
        }${startsGroup ? " navigation-item--group-start" : ""}${
          isMobilePrimary(item.label)
            ? ""
            : " navigation-item--mobile-secondary"
        }${mobileSecondary ? " navigation-item--mobile-more-link" : ""}`}
        href={href}
        key={item.label}
        aria-current={isActive ? "page" : undefined}
        onClick={(event) => {
          if (
            item.administrationPath ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          if (isLocal) navigateTo(href);
        }}
        whileHover="hover"
        whileTap="tap"
        animate={isActive ? "active" : "rest"}
        variants={navItemVariants}
      >
        {isActive ? (
          <motion.span
            layoutId="active-nav-pill"
            className="navigation-item__pill"
            aria-hidden="true"
          />
        ) : null}
        <Icon aria-hidden="true" size={21} />
        <span>{item.label}</span>
      </motion.a>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
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
              {availableNavigation.map((item, index) =>
                renderNavigationItem(item, index),
              )}
              <details className="navigation-more">
                <summary>
                  <Wrench aria-hidden="true" size={21} />
                  <span>More</span>
                </summary>
                <div className="navigation-more__links">
                  {availableNavigation
                    .filter((item) => !isMobilePrimary(item.label))
                    .map((item) => {
                      const index = availableNavigation.indexOf(item);
                      return renderNavigationItem(item, index, true);
                    })}
                </div>
              </details>
            </nav>

            <div className="rail-profile">
              <span className="rail-profile__avatar" aria-hidden="true">
                <UserRound size={19} />
              </span>
              <span className="visually-hidden">
                Authenticated employee {profile.employee.displayName}
              </span>
            </div>
          </aside>

          <div className="application">
            <header className="context-bar">
              <div className="context-bar__title">
                <p>Staff workspace</p>
                <h1>{visibleSection ?? "Unavailable"}</h1>
              </div>
              <div className="context-item">
                <span className="context-item__label">Branch</span>
                <strong>{portal.capabilities.branchName}</strong>
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
              <motion.button
                className="icon-button"
                type="button"
                aria-label="Refresh staff access and API readiness"
                aria-describedby={statusId}
                disabled={readiness.kind === "checking"}
                onClick={refresh}
                whileHover="hover"
                whileTap="tap"
                variants={iconButtonVariants}
              >
                <RefreshCw
                  aria-hidden="true"
                  size={20}
                  className={readiness.kind === "checking" ? "is-spinning" : ""}
                />
              </motion.button>
              <motion.button
                className="icon-button"
                type="button"
                aria-label="Open notifications"
                aria-pressed={visibleSection === "Notifications"}
                disabled={!notificationsAvailable}
                onClick={() => selectSection("Notifications")}
                whileHover="hover"
                whileTap="tap"
                variants={iconButtonVariants}
              >
                <Bell aria-hidden="true" size={20} />
              </motion.button>
              <details className="account-context">
                <summary>
                  <UserRound aria-hidden="true" size={18} />
                  <span>{profile.employee.displayName}</span>
                </summary>
                <div className="account-context__panel">
                  <strong>{profile.restaurant.name}</strong>
                  <span>
                    {profile.activeBranch?.name ?? "No active branch"}
                  </span>
                  <span className="account-context__label">
                    Effective responsibilities
                  </span>
                  <ul>
                    {responsibilities.length > 0 ? (
                      responsibilities.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>Assigned staff access</li>
                    )}
                  </ul>
                  {canOpenAdministration(portal.session) ? (
                    <a
                      href={`${administrationOrigin}/context?returnTo=${encodeURIComponent(
                        safeInternalPath(
                          `${location.pathname}${location.search}`,
                        ),
                      )}`}
                    >
                      Open administration
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={logoutState === "pending"}
                  >
                    {logoutState === "pending" ? "Signing out…" : "Sign out"}
                  </button>
                  <p
                    className="account-context__message"
                    role="status"
                    aria-live="polite"
                  >
                    {logoutMessage}
                  </p>
                </div>
              </details>
            </header>

            <main id="workspace" className="workspace" tabIndex={-1}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={visibleSection}
                  className="workspace__stage"
                  variants={sectionContainerVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                >
                  {routeState !== "ready" ? (
                    <RouteBoundary
                      kind={routeState}
                      landingSection={landingSection}
                      onNavigate={navigateTo}
                    />
                  ) : visibleSection === "Home" ? (
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
                      canViewPayments={portal.capabilities.permissions.includes(
                        "payments.view",
                      )}
                      canViewKitchen={portal.capabilities.permissions.includes(
                        "kitchen.view",
                      )}
                      canServe={portal.capabilities.permissions.includes(
                        "orders.serve",
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
                      canViewOrders={portal.capabilities.permissions.includes(
                        "orders.view",
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
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>
    </MotionConfig>
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
        {portal.kind === "signed-out" ? (
          <a
            className="access-boundary__action"
            href={authPath(
              "sign-in",
              safeInternalPath(window.location.pathname),
            )}
          >
            Sign in to staff access
          </a>
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
    <motion.div
      className="workspace__content"
      variants={staggerContainerVariants}
      initial="initial"
      animate="enter"
    >
      <motion.section
        className="launch-banner"
        variants={fadeUpItemVariants}
        aria-labelledby="launch-title"
      >
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
      </motion.section>

      <div className="workspace-grid">
        <motion.section
          className="workspace-panel"
          variants={fadeUpItemVariants}
          aria-labelledby="access-title"
        >
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
        </motion.section>

        <motion.section
          className="workspace-panel"
          variants={fadeUpItemVariants}
          aria-labelledby="boundary-title"
        >
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
        </motion.section>

        <motion.section
          className="workspace-panel workspace-panel--accent"
          variants={fadeUpItemVariants}
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
        </motion.section>
      </div>
      <DashboardWorkspace branchId={branchId} canView={canViewReports} />
    </motion.div>
  );
}

function RouteBoundary({
  kind,
  landingSection,
  onNavigate,
}: {
  readonly kind: "not-found" | "unauthorized";
  readonly landingSection: StaffSection;
  readonly onNavigate: (href: string) => void;
}) {
  const title =
    kind === "not-found"
      ? "That staff destination is not available"
      : "That staff destination is outside your access";
  const detail =
    kind === "not-found"
      ? "The address may be old or incomplete. Choose an authorized workspace to continue."
      : "This route was rejected without requesting data outside your current branch permissions.";
  return (
    <section className="deferred-state" aria-labelledby="route-boundary-title">
      <span className="deferred-state__icon" aria-hidden="true">
        <ClipboardList size={28} />
      </span>
      <p className="eyebrow">STAFF ROUTE BOUNDARY</p>
      <h2 id="route-boundary-title">{title}</h2>
      <p>{detail}</p>
      <button
        type="button"
        onClick={() => onNavigate(staffPathForSection(landingSection))}
      >
        Open {landingSection.toLowerCase()}
      </button>
    </section>
  );
}
