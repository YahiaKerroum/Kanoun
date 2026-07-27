import {
  Badge,
  Bell,
  ChefHat,
  ClipboardList,
  History,
  House,
  Menu as MenuIcon,
  MonitorCheck,
  PackageOpen,
  RefreshCw,
  Settings,
  TableProperties,
  Users,
  UserRound,
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
import { checkApiReadiness, type Readiness } from "./health.js";

type Section =
  | "Home"
  | "Orders"
  | "Tables"
  | "Kitchen"
  | "Menu"
  | "Stock"
  | "Staff"
  | "Reports"
  | "Setup"
  | "Audit";

interface NavigationItem {
  readonly label: Section;
  readonly icon: ComponentType<LucideProps>;
  readonly group: "service" | "maintain" | "review";
}

const navigationItems: readonly NavigationItem[] = [
  { label: "Home", icon: House, group: "service" },
  { label: "Orders", icon: ClipboardList, group: "service" },
  { label: "Tables", icon: TableProperties, group: "service" },
  { label: "Kitchen", icon: ChefHat, group: "service" },
  { label: "Menu", icon: MenuIcon, group: "maintain" },
  { label: "Stock", icon: PackageOpen, group: "maintain" },
  { label: "Staff", icon: Users, group: "maintain" },
  { label: "Reports", icon: MonitorCheck, group: "review" },
  { label: "Setup", icon: Settings, group: "review" },
  { label: "Audit", icon: History, group: "review" },
];

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

export function App() {
  const [activeSection, setActiveSection] = useState<Section>("Home");
  const [readiness, setReadiness] = useState<Readiness>({ kind: "checking" });
  const [refreshSequence, setRefreshSequence] = useState(0);
  const statusId = useId();

  useEffect(() => {
    const abortController = new AbortController();
    setReadiness({ kind: "checking" });

    void checkApiReadiness(abortController.signal)
      .then((result) => {
        if (!abortController.signal.aborted) {
          setReadiness(result);
        }
      })
      .catch((error: unknown) => {
        if (
          !abortController.signal.aborted ||
          !(error instanceof DOMException) ||
          error.name !== "AbortError"
        ) {
          throw error;
        }
      });

    return () => abortController.abort();
  }, [refreshSequence]);

  const selectSection = useCallback((section: Section) => {
    startTransition(() => setActiveSection(section));
  }, []);

  const refresh = useCallback(() => {
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

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
              {navigationItems.map((item, index) => {
                const Icon = item.icon;
                const previousGroup = navigationItems[index - 1]?.group;
                const startsGroup = index > 0 && previousGroup !== item.group;
                const isActive = activeSection === item.label;

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
                Signed in user is not configured
              </span>
            </div>
          </aside>

          <div className="application">
            <header className="context-bar">
              <div className="context-bar__title">
                <p>Staff workspace</p>
                <h1>{activeSection}</h1>
              </div>
              <div className="context-item">
                <span className="context-item__label">Branch</span>
                <strong>No branch selected</strong>
              </div>
              <div className="context-item">
                <span className="context-item__label">Service</span>
                <strong>Setup required</strong>
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
                aria-label="Refresh API readiness"
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
                aria-label="Notifications are not available in Slice 001"
                disabled
              >
                <Bell aria-hidden="true" size={20} />
              </button>
            </header>

            <main id="workspace" className="workspace" tabIndex={-1}>
              {activeSection === "Home" ? (
                <HomeWorkspace readiness={readiness} statusId={statusId} />
              ) : (
                <DeferredWorkspace section={activeSection} />
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

function HomeWorkspace({
  readiness,
  statusId,
}: {
  readonly readiness: Readiness;
  readonly statusId: string;
}) {
  const apiReady = readiness.kind === "ready";

  return (
    <div className="workspace__content">
      <section className="launch-banner" aria-labelledby="launch-title">
        <div>
          <p className="eyebrow">SLICE 001 · APPLICATION BOOTSTRAP</p>
          <h2 id="launch-title">Foundation first. Service flows next.</h2>
          <p>
            The production workspace, contracts, and database foundation are
            being verified before restaurant records or operational actions are
            introduced.
          </p>
        </div>
        <div className="launch-banner__status" id={statusId} role="status">
          <ReadinessMark readiness={readiness} />
          <span>
            {apiReady
              ? "API and PostgreSQL responded successfully."
              : readiness.kind === "checking"
                ? "Verifying API and PostgreSQL."
                : `${readiness.reason}. Start the API to verify the full stack.`}
          </span>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="workspace-panel" aria-labelledby="readiness-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current increment</p>
              <h2 id="readiness-title">System readiness</h2>
            </div>
            <span className="panel-count">3 checks</span>
          </div>
          <ul className="check-list">
            <li>
              <span className="check-icon check-icon--ready" aria-hidden="true">
                <Badge size={19} />
              </span>
              <div>
                <strong>Contracts loaded</strong>
                <span>OpenAPI and event catalog validation is configured.</span>
              </div>
              <span className="state-label state-label--ready">Ready</span>
            </li>
            <li>
              <span
                className={`check-icon check-icon--${apiReady ? "ready" : "waiting"}`}
                aria-hidden="true"
              >
                <MonitorCheck size={19} />
              </span>
              <div>
                <strong>API and database</strong>
                <span>
                  Readiness fails closed when PostgreSQL is unavailable.
                </span>
              </div>
              <span
                className={`state-label state-label--${
                  apiReady ? "ready" : "waiting"
                }`}
              >
                {apiReady ? "Ready" : "Verify"}
              </span>
            </li>
            <li>
              <span
                className="check-icon check-icon--waiting"
                aria-hidden="true"
              >
                <Users size={19} />
              </span>
              <div>
                <strong>Restaurant context</strong>
                <span>
                  Tenant, branch, owner, and staff setup begins in Slice 002.
                </span>
              </div>
              <span className="state-label state-label--waiting">Next</span>
            </li>
          </ul>
        </section>

        <section className="workspace-panel" aria-labelledby="next-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next vertical slice</p>
              <h2 id="next-title">Owner and branch bootstrap</h2>
            </div>
            <span className="slice-number">002</span>
          </div>
          <p className="panel-copy">
            Establish the first protected owner, tenant, restaurant, branch,
            operating hours, sessions, and last-administrator guard.
          </p>
          <dl className="scope-list">
            <div>
              <dt>Implements</dt>
              <dd>US-A01, US-A02, US-A04, US-R01–R04</dd>
            </div>
            <div>
              <dt>Proof required</dt>
              <dd>Authorization, tenant isolation, session revocation</dd>
            </div>
          </dl>
        </section>

        <section
          className="workspace-panel workspace-panel--accent"
          aria-labelledby="design-title"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Design authority</p>
              <h2 id="design-title">MISE · Saffron Gold</h2>
            </div>
            <ChefHat aria-hidden="true" size={26} />
          </div>
          <p className="panel-copy">
            This shell follows the supplied v2 design artifact: saffron frame,
            ivory working surface, compact context, restrained panels, and one
            obvious next action.
          </p>
          <span className="working-name">Working product name</span>
        </section>
      </div>
    </div>
  );
}

function DeferredWorkspace({ section }: { readonly section: Section }) {
  return (
    <section className="deferred-state" aria-labelledby="deferred-title">
      <span className="deferred-state__icon" aria-hidden="true">
        <ClipboardList size={28} />
      </span>
      <p className="eyebrow">DELIVERY ORDER PROTECTED</p>
      <h2 id="deferred-title">{section} is not implemented yet</h2>
      <p>
        This destination is part of the approved information architecture. Its
        real data, permissions, states, and actions will arrive in the
        requirement slice that owns them.
      </p>
    </section>
  );
}
