import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Clock3,
  EyeOff,
  RefreshCw,
  TableProperties,
  UsersRound,
  Wrench,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  actionButtonVariants,
  fadeUpItemVariants,
  staggerContainerVariants,
} from "./motion.js";

const copy = {
  menu: {
    eyebrow: "CURRENT RESTAURANT MENU",
    title: "What guests can order",
    detail:
      "Restaurant categories, base prices, and current dish availability. Branch-specific changes are applied in the guest menu.",
    deniedTitle: "Menu view permission required",
    deniedDetail:
      "This destination is visible because you have menu responsibilities, but menu.view is required to load or display the menu.",
    scopeTitle: "Restaurant scope unavailable",
    scopeDetail:
      "The active branch could not be matched to one restaurant from your scoped session grants. Refresh access or ask an administrator to correct the assignment.",
    emptyTitle: "No menu items yet",
    emptyDetail:
      "No categories or dishes are configured for this restaurant. Menu maintenance remains in the administration workspace.",
  },
  tables: {
    eyebrow: "LIVE BRANCH FLOOR",
    title: "Table availability",
    detail:
      "Current table records and server-derived states for this branch. Scanning a QR code alone never marks a table occupied.",
    deniedTitle: "Table view permission required",
    deniedDetail:
      "This destination is visible because you have table responsibilities, but tables.view is required to load or display the table list.",
    emptyTitle: "No tables configured",
    emptyDetail:
      "This branch has no table records yet. Table maintenance remains in the administration workspace.",
  },
  shared: {
    loading: "Loading current branch data…",
    invalidResponse:
      "The server returned data that does not match the staff workspace contract.",
    unavailable:
      "Current data could not be loaded. Check the connection and try again.",
    stale:
      "The latest reload failed. The list below is the last verified snapshot and may be stale.",
    reload: "Reload data",
    lastUpdated: "Last verified",
  },
} as const;

const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const categorySchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  displayOrder: z.number().int().nonnegative(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});

const dishSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  restaurantId: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  basePrice: moneySchema,
  status: z.enum(["active", "inactive"]),
  available: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

const menuResponseSchema = z.object({
  categories: z.object({ items: z.array(categorySchema) }),
  dishes: z.object({ items: z.array(dishSchema) }),
});

const tableSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  branchId: z.uuid(),
  code: z.string(),
  area: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]),
  outOfService: z.boolean(),
  version: z.number().int().positive(),
  derivedState: z.enum(["inactive", "out_of_service", "occupied", "available"]),
});

const tablesResponseSchema = z.object({ items: z.array(tableSchema) });

type MenuData = z.infer<typeof menuResponseSchema>;
type TableRecord = z.infer<typeof tableSchema>;
type TablesData = z.infer<typeof tablesResponseSchema>;

type ResourceState<Data> =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly data: Data;
      readonly verifiedAt: Date;
    }
  | {
      readonly kind: "stale";
      readonly data: Data;
      readonly verifiedAt: Date;
      readonly message: string;
    }
  | { readonly kind: "error"; readonly message: string };

class WorkspaceRequestError extends Error {
  public constructor(public readonly status: number) {
    super(
      status === 403
        ? "Your current staff access does not permit this request."
        : copy.shared.unavailable,
    );
    this.name = "WorkspaceRequestError";
  }
}

async function getJson<Output>(
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
    throw new WorkspaceRequestError(response.status);
  }
  return schema.parse(await response.json());
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return copy.shared.invalidResponse;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return copy.shared.unavailable;
}

function useResource<Data>(load: (signal: AbortSignal) => Promise<Data>): {
  readonly state: ResourceState<Data>;
  readonly refreshing: boolean;
  readonly reload: () => void;
} {
  const [state, setState] = useState<ResourceState<Data>>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [sequence, setSequence] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    setRefreshing(true);

    void load(abortController.signal)
      .then((data) => {
        if (!abortController.signal.aborted) {
          setState({ kind: "ready", data, verifiedAt: new Date() });
        }
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        const message = errorMessage(error);
        setState((current) =>
          current.kind === "ready" || current.kind === "stale"
            ? {
                kind: "stale",
                data: current.data,
                verifiedAt: current.verifiedAt,
                message,
              }
            : { kind: "error", message },
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setRefreshing(false);
        }
      });

    return () => abortController.abort();
  }, [load, sequence]);

  const reload = useCallback(() => {
    setSequence((current) => current + 1);
  }, []);

  return { state, refreshing, reload };
}

function formatVerifiedAt(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatMoney(amount: string, currency: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currency}`;
  }
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(numericAmount);
}

function WorkspaceHeading({
  eyebrow,
  title,
  detail,
  summary,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly summary: ReactNode;
}) {
  return (
    <header className="operational-heading">
      <div className="operational-heading__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {summary}
    </header>
  );
}

function WorkspaceBoundary({
  title,
  detail,
  icon,
}: {
  readonly title: string;
  readonly detail: string;
  readonly icon: ReactNode;
}) {
  return (
    <section className="workspace-message" aria-labelledby="workspace-message">
      <span className="workspace-message__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="eyebrow">ACCESS BOUNDARY</p>
      <h2 id="workspace-message">{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

function ResourceFeedback({
  state,
  refreshing,
  reload,
  children,
}: {
  readonly state: ResourceState<unknown>;
  readonly refreshing: boolean;
  readonly reload: () => void;
  readonly children: ReactNode;
}) {
  if (state.kind === "loading") {
    return (
      <div className="workspace-loading" role="status">
        <RefreshCw className="is-spinning" aria-hidden="true" size={22} />
        <span>{copy.shared.loading}</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="workspace-message" aria-labelledby="load-error-title">
        <span className="workspace-message__icon" aria-hidden="true">
          <CircleAlert size={28} />
        </span>
        <p className="eyebrow">DATA UNAVAILABLE</p>
        <h2 id="load-error-title">The workspace could not be refreshed</h2>
        <p>{state.message}</p>
        <motion.button
          className="workspace-action"
          type="button"
          onClick={reload}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          <RefreshCw aria-hidden="true" size={18} />
          {copy.shared.reload}
        </motion.button>
      </section>
    );
  }

  return (
    <>
      <div
        className={`snapshot-status${
          state.kind === "stale" ? " snapshot-status--stale" : ""
        }`}
        role="status"
      >
        <span>
          {state.kind === "stale" ? (
            <CircleAlert aria-hidden="true" size={18} />
          ) : (
            <Clock3 aria-hidden="true" size={18} />
          )}
          {state.kind === "stale"
            ? copy.shared.stale
            : `${copy.shared.lastUpdated} ${formatVerifiedAt(state.verifiedAt)}`}
        </span>
        <motion.button
          className="workspace-action workspace-action--quiet"
          type="button"
          disabled={refreshing}
          onClick={reload}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          <RefreshCw
            className={refreshing ? "is-spinning" : ""}
            aria-hidden="true"
            size={17}
          />
          {refreshing ? "Reloading…" : copy.shared.reload}
        </motion.button>
      </div>
      {children}
    </>
  );
}

export function MenuWorkspace({
  restaurantId,
  canView,
}: {
  readonly restaurantId: string | null;
  readonly canView: boolean;
}) {
  if (!canView) {
    return (
      <WorkspaceBoundary
        title={copy.menu.deniedTitle}
        detail={copy.menu.deniedDetail}
        icon={<EyeOff size={28} />}
      />
    );
  }
  if (!restaurantId) {
    return (
      <WorkspaceBoundary
        title={copy.menu.scopeTitle}
        detail={copy.menu.scopeDetail}
        icon={<CircleAlert size={28} />}
      />
    );
  }
  return <MenuResource restaurantId={restaurantId} />;
}

function MenuResource({ restaurantId }: { readonly restaurantId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [categories, dishes] = await Promise.all([
        getJson(
          `/api/v1/staff/restaurants/${restaurantId}/menu/categories`,
          z.object({ items: z.array(categorySchema) }),
          signal,
        ),
        getJson(
          `/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
          z.object({ items: z.array(dishSchema) }),
          signal,
        ),
      ]);
      return menuResponseSchema.parse({ categories, dishes });
    },
    [restaurantId],
  );
  const resource = useResource(load);
  const data =
    resource.state.kind === "ready" || resource.state.kind === "stale"
      ? resource.state.data
      : null;

  const summary = useMemo(() => {
    const categories = data?.categories.items.length ?? 0;
    const dishes = data?.dishes.items.length ?? 0;
    const available =
      data?.dishes.items.filter(
        (dish) => dish.status === "active" && dish.available,
      ).length ?? 0;
    return { categories, dishes, available };
  }, [data]);

  return (
    <div className="workspace__content operational-workspace">
      <WorkspaceHeading
        eyebrow={copy.menu.eyebrow}
        title={copy.menu.title}
        detail={copy.menu.detail}
        summary={
          <dl className="workspace-metrics" aria-label="Menu summary">
            <div>
              <dt>Categories</dt>
              <dd>{summary.categories}</dd>
            </div>
            <div>
              <dt>Dishes</dt>
              <dd>{summary.dishes}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{summary.available}</dd>
            </div>
          </dl>
        }
      />
      <ResourceFeedback {...resource}>
        {data ? <MenuList data={data} /> : null}
      </ResourceFeedback>
    </div>
  );
}

function MenuList({ data }: { readonly data: MenuData }) {
  const categories = [...data.categories.items].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name),
  );
  const dishesByCategory = new Map<string, typeof data.dishes.items>();
  for (const category of categories) {
    dishesByCategory.set(
      category.id,
      data.dishes.items
        .filter((dish) => dish.categoryId === category.id)
        .sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.name.localeCompare(right.name),
        ),
    );
  }

  if (categories.length === 0 && data.dishes.items.length === 0) {
    return (
      <div className="workspace-empty">
        <MenuEmptyIcon />
        <h3>{copy.menu.emptyTitle}</h3>
        <p>{copy.menu.emptyDetail}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="menu-sections"
      initial="initial"
      animate="enter"
      variants={staggerContainerVariants}
    >
      {categories.map((category) => {
        const dishes = dishesByCategory.get(category.id) ?? [];
        return (
          <motion.section
            className="menu-section"
            key={category.id}
            variants={fadeUpItemVariants}
            aria-labelledby={`category-${category.id}`}
          >
            <header className="menu-section__heading">
              <div>
                <h3 id={`category-${category.id}`}>{category.name}</h3>
                <span>
                  {dishes.length} dish{dishes.length === 1 ? "" : "es"}
                </span>
              </div>
              <span
                className={`state-label state-label--${
                  category.status === "active" ? "ready" : "inactive"
                }`}
              >
                {category.status === "active" ? "Active" : "Inactive"}
              </span>
            </header>
            {dishes.length === 0 ? (
              <p className="menu-section__empty">No dishes in this category.</p>
            ) : (
              <ul className="operational-list">
                {dishes.map((dish) => {
                  const available = dish.status === "active" && dish.available;
                  const description = dish.description?.trim();
                  return (
                    <li key={dish.id}>
                      <div className="operational-list__main">
                        <strong>{dish.name}</strong>
                        <span>
                          {description && description.length > 0
                            ? description
                            : "No description provided."}
                        </span>
                      </div>
                      <strong className="operational-list__value">
                        {formatMoney(
                          dish.basePrice.amount,
                          dish.basePrice.currency,
                        )}
                      </strong>
                      <span
                        className={`state-label state-label--${
                          available ? "ready" : "unavailable"
                        }`}
                      >
                        {available ? "Available" : "Unavailable"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>
        );
      })}
      {data.dishes.items.some(
        (dish) =>
          !data.categories.items.some(({ id }) => id === dish.categoryId),
      ) ? (
        <div className="snapshot-status snapshot-status--stale" role="status">
          <span>
            <CircleAlert aria-hidden="true" size={18} />
            Some dishes reference a category that was not returned. Reload the
            menu before relying on this snapshot.
          </span>
        </div>
      ) : null}
    </motion.div>
  );
}

function MenuEmptyIcon() {
  return (
    <span className="workspace-empty__icon" aria-hidden="true">
      <Ban size={25} />
    </span>
  );
}

export function TablesWorkspace({
  branchId,
  canView,
}: {
  readonly branchId: string;
  readonly canView: boolean;
}) {
  if (!canView) {
    return (
      <WorkspaceBoundary
        title={copy.tables.deniedTitle}
        detail={copy.tables.deniedDetail}
        icon={<EyeOff size={28} />}
      />
    );
  }
  return <TablesResource branchId={branchId} />;
}

function TablesResource({ branchId }: { readonly branchId: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      getJson(
        `/api/v1/staff/branches/${branchId}/tables`,
        tablesResponseSchema,
        signal,
      ),
    [branchId],
  );
  const resource = useResource(load);
  const data =
    resource.state.kind === "ready" || resource.state.kind === "stale"
      ? resource.state.data
      : null;

  const counts = useMemo(() => {
    const result: Record<TableRecord["derivedState"], number> = {
      available: 0,
      occupied: 0,
      out_of_service: 0,
      inactive: 0,
    };
    for (const table of data?.items ?? []) {
      result[table.derivedState] += 1;
    }
    return result;
  }, [data]);

  return (
    <div className="workspace__content operational-workspace">
      <WorkspaceHeading
        eyebrow={copy.tables.eyebrow}
        title={copy.tables.title}
        detail={copy.tables.detail}
        summary={
          <dl className="workspace-metrics" aria-label="Table state summary">
            <div>
              <dt>Available</dt>
              <dd>{counts.available}</dd>
            </div>
            <div>
              <dt>Occupied</dt>
              <dd>{counts.occupied}</dd>
            </div>
            <div>
              <dt>Unavailable</dt>
              <dd>{counts.out_of_service + counts.inactive}</dd>
            </div>
          </dl>
        }
      />
      <ResourceFeedback {...resource}>
        {data ? <TablesList data={data} /> : null}
      </ResourceFeedback>
    </div>
  );
}

const tableStatePresentation: Record<
  TableRecord["derivedState"],
  {
    readonly label: string;
    readonly className: string;
    readonly icon: ReactNode;
  }
> = {
  available: {
    label: "Available",
    className: "ready",
    icon: <CheckCircle2 aria-hidden="true" size={17} />,
  },
  occupied: {
    label: "Occupied",
    className: "occupied",
    icon: <UsersRound aria-hidden="true" size={17} />,
  },
  out_of_service: {
    label: "Out of service",
    className: "unavailable",
    icon: <Wrench aria-hidden="true" size={17} />,
  },
  inactive: {
    label: "Inactive",
    className: "inactive",
    icon: <Ban aria-hidden="true" size={17} />,
  },
};

function TablesList({ data }: { readonly data: TablesData }) {
  if (data.items.length === 0) {
    return (
      <div className="workspace-empty">
        <span className="workspace-empty__icon" aria-hidden="true">
          <TableProperties size={25} />
        </span>
        <h3>{copy.tables.emptyTitle}</h3>
        <p>{copy.tables.emptyDetail}</p>
      </div>
    );
  }

  const grouped = new Map<string, TableRecord[]>();
  for (const table of [...data.items].sort((left, right) =>
    left.code.localeCompare(right.code, undefined, { numeric: true }),
  )) {
    const normalizedArea = table.area?.trim();
    const area =
      normalizedArea && normalizedArea.length > 0
        ? normalizedArea
        : "Unassigned area";
    grouped.set(area, [...(grouped.get(area) ?? []), table]);
  }

  return (
    <motion.div
      className="table-areas"
      initial="initial"
      animate="enter"
      variants={staggerContainerVariants}
    >
      {[...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([area, tables]) => (
          <motion.section
            className="table-area"
            key={area}
            variants={fadeUpItemVariants}
            aria-labelledby={`area-${area.replaceAll(/\W+/g, "-")}`}
          >
            <header className="table-area__heading">
              <h3 id={`area-${area.replaceAll(/\W+/g, "-")}`}>{area}</h3>
              <span>
                {tables.length} table{tables.length === 1 ? "" : "s"}
              </span>
            </header>
            <ul className="table-list">
              {tables.map((table) => {
                const presentation = tableStatePresentation[table.derivedState];
                return (
                  <li key={table.id}>
                    <span className="table-code">{table.code}</span>
                    <span
                      className={`table-state table-state--${presentation.className}`}
                    >
                      {presentation.icon}
                      {presentation.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))}
    </motion.div>
  );
}
