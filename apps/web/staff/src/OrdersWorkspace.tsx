import { CircleAlert, Clock3, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";

const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+(?:\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const tableSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(["active", "inactive"]),
  outOfService: z.boolean(),
  derivedState: z.enum(["inactive", "out_of_service", "occupied", "available"]),
});

const dishSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  basePrice: moneySchema,
  status: z.enum(["active", "inactive"]),
  available: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
});

const optionGroupSchema = z.object({
  id: z.uuid(),
  dishId: z.uuid(),
  name: z.string(),
  minimum: z.number().int().nonnegative(),
  maximum: z.number().int().positive(),
  options: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      priceDelta: moneySchema,
      displayOrder: z.number().int().nonnegative(),
      status: z.enum(["active", "inactive"]),
    }),
  ),
});

const branchOverrideSchema = z.object({
  branchId: z.uuid(),
  dishId: z.uuid(),
  price: moneySchema.nullable().optional(),
  available: z.boolean().nullable().optional(),
  visible: z.boolean(),
});

const orderSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  version: z.number().int().positive(),
  branchId: z.uuid(),
  tableSessionId: z.uuid(),
  tableId: z.uuid(),
  tableCode: z.string(),
  creatorType: z.enum(["guest", "staff"]),
  createdByEmployeeId: z.uuid().nullable(),
  customerName: z.string().nullable(),
  approval: z.enum(["submitted", "accepted", "rejected"]),
  fulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  financial: z.enum(["unpaid", "paid", "partially_refunded", "refunded"]),
  closure: z.enum(["active", "completed", "cancelled"]),
  customerSafeStatusReason: z.string().nullable(),
  total: moneySchema,
  submittedAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime(),
  cancellationRequested: z.boolean(),
  items: z.array(
    z.object({
      id: z.uuid(),
      dishId: z.uuid(),
      menuVersion: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: moneySchema,
      selectedOptions: z.array(
        z.object({
          optionId: z.uuid(),
          optionName: z.string(),
          priceDelta: moneySchema,
        }),
      ),
      note: z.string().nullable(),
      total: moneySchema,
    }),
  ),
});

const ordersPageSchema = z.object({
  items: z.array(orderSchema),
  nextCursor: z.string().nullable(),
});
const tablesPageSchema = z.object({ items: z.array(tableSchema) });
const dishesPageSchema = z.object({
  items: z.array(dishSchema),
  menuVersion: z.number().int().positive(),
});
const optionGroupsPageSchema = z.object({ items: z.array(optionGroupSchema) });

type Order = z.infer<typeof orderSchema>;
type Table = z.infer<typeof tableSchema>;
type Dish = z.infer<typeof dishSchema>;
type OptionGroup = z.infer<typeof optionGroupSchema>;
type BranchOverride = z.infer<typeof branchOverrideSchema>;

interface OrderFilters {
  readonly approval: string;
  readonly fulfilment: string;
  readonly tableId: string;
  readonly createdByEmployeeId: string;
  readonly submittedFrom: string;
  readonly submittedTo: string;
}

interface DraftItem {
  readonly clientId: string;
  readonly dish: Dish;
  readonly quantity: number;
  readonly optionIds: readonly string[];
  readonly optionNames: readonly string[];
  readonly note?: string | undefined;
  readonly estimatedUnitAmount: number;
  readonly currency: string;
}

type LoadState<Data> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: Data }
  | { readonly kind: "stale"; readonly data: Data; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

const initialFilters: OrderFilters = {
  approval: "",
  fulfilment: "",
  tableId: "",
  createdByEmployeeId: "",
  submittedFrom: "",
  submittedTo: "",
};

const filterSchema = z
  .object({
    approval: z.enum(["", "submitted", "accepted", "rejected"]),
    fulfilment: z.enum(["", "not_started", "preparing", "ready", "served"]),
    tableId: z.union([z.literal(""), z.uuid()]),
    createdByEmployeeId: z.union([z.literal(""), z.uuid()]),
    submittedFrom: z.string(),
    submittedTo: z.string(),
  })
  .refine(
    (value) =>
      !value.submittedFrom ||
      !value.submittedTo ||
      new Date(value.submittedFrom) <= new Date(value.submittedTo),
    {
      path: ["submittedFrom"],
      message: "The start time must be before the end time.",
    },
  );

class OrdersRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code?: string,
    message = "Current order data could not be loaded.",
  ) {
    super(message);
    this.name = "OrdersRequestError";
  }
}

async function responseError(response: Response): Promise<OrdersRequestError> {
  const problem = z
    .object({
      code: z.string().optional(),
      title: z.string(),
      detail: z.string().nullable().optional(),
    })
    .safeParse(await response.json().catch(() => undefined));
  return new OrdersRequestError(
    response.status,
    problem.success ? problem.data.code : undefined,
    problem.success
      ? (problem.data.detail ?? problem.data.title)
      : "The request could not be completed.",
  );
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
  if (!response.ok) throw await responseError(response);
  return schema.parse(await response.json());
}

function csrfToken(): string {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice("rms_csrf=".length) ?? ""
  );
}

async function createOrder(
  input: unknown,
  idempotencyKey: string,
): Promise<Order> {
  const response = await fetch("/api/v1/staff/orders", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken(),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await responseError(response);
  return orderSchema.parse(await response.json());
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "The server returned data that does not match the Orders workspace contract.";
  }
  return error instanceof Error
    ? error.message
    : "The Orders workspace could not be loaded.";
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

function formatEstimatedMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatSubmittedAt(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function elapsedTime(value: string, now: number): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function lifecycleLabel(order: Order): string {
  if (order.closure !== "active") return order.closure;
  if (order.approval !== "accepted") return order.approval;
  return order.fulfilment.replace("_", " ");
}

export function OrdersWorkspace(props: {
  readonly branchId: string;
  readonly restaurantId: string | null;
  readonly employeeId: string;
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canViewMenu: boolean;
  readonly canViewTables: boolean;
}) {
  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<OrderFilters>(initialFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const [entryOpen, setEntryOpen] = useState(false);
  const entryDialog = useRef<HTMLDialogElement>(null);
  const entryTrigger = useRef<HTMLButtonElement>(null);
  const [tables, setTables] = useState<LoadState<readonly Table[]>>({
    kind: "loading",
  });

  const dependencyTablesEnabled =
    props.canViewTables && (props.canView || props.canCreate);

  useEffect(() => {
    if (!dependencyTablesEnabled) return;
    const abortController = new AbortController();
    void getJson(
      `/api/v1/staff/branches/${props.branchId}/tables`,
      tablesPageSchema,
      abortController.signal,
    )
      .then((result) => {
        if (!abortController.signal.aborted) {
          setTables({ kind: "ready", data: result.items });
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setTables({ kind: "error", message: errorMessage(error) });
        }
      });
    return () => abortController.abort();
  }, [dependencyTablesEnabled, props.branchId]);

  useEffect(() => {
    const dialog = entryDialog.current;
    if (!dialog) return;
    if (entryOpen && !dialog.open) dialog.showModal();
    if (!entryOpen && dialog.open) dialog.close();
  }, [entryOpen]);

  function applyFilters(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const parsed = filterSchema.safeParse(filters);
    if (!parsed.success) {
      setFilterError(parsed.error.issues[0]?.message ?? "Review the filters.");
      return;
    }
    setFilterError(null);
    setAppliedFilters(parsed.data);
  }

  const tableItems =
    tables.kind === "ready" || tables.kind === "stale" ? tables.data : [];

  return (
    <div className="workspace__content orders-workspace">
      <header className="orders-heading">
        <div>
          <p className="eyebrow">ACTIVE BRANCH ORDERS</p>
          <h2>Order flow</h2>
          <p>
            Submitted work for this branch, with server-owned lifecycle state
            and elapsed time.
          </p>
        </div>
        {props.canCreate ? (
          <button
            ref={entryTrigger}
            className="orders-primary-action"
            type="button"
            onClick={() => setEntryOpen(true)}
          >
            <Plus aria-hidden="true" size={18} />
            Create order
          </button>
        ) : null}
      </header>

      {props.canView ? (
        <>
          <form className="order-filters" onSubmit={applyFilters}>
            <label>
              <span>Approval</span>
              <select
                value={filters.approval}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFilters((current) => ({
                    ...current,
                    approval: value,
                  }));
                }}
              >
                <option value="">All approval states</option>
                <option value="submitted">Submitted</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label>
              <span>Fulfilment</span>
              <select
                value={filters.fulfilment}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFilters((current) => ({
                    ...current,
                    fulfilment: value,
                  }));
                }}
              >
                <option value="">All fulfilment states</option>
                <option value="not_started">Not started</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="served">Served</option>
              </select>
            </label>
            <label>
              <span>Table</span>
              {tableItems.length > 0 ? (
                <select
                  value={filters.tableId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFilters((current) => ({
                      ...current,
                      tableId: value,
                    }));
                  }}
                >
                  <option value="">All tables</option>
                  {tableItems.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.code}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filters.tableId}
                  placeholder="Table UUID"
                  onChange={(event) => {
                    const value = event.currentTarget.value.trim();
                    setFilters((current) => ({
                      ...current,
                      tableId: value,
                    }));
                  }}
                />
              )}
            </label>
            <label>
              <span>Creating employee</span>
              <input
                value={filters.createdByEmployeeId}
                placeholder="Employee UUID"
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  setFilters((current) => ({
                    ...current,
                    createdByEmployeeId: value,
                  }));
                }}
              />
            </label>
            <label>
              <span>Submitted from</span>
              <input
                type="datetime-local"
                value={filters.submittedFrom}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFilters((current) => ({
                    ...current,
                    submittedFrom: value,
                  }));
                }}
              />
            </label>
            <label>
              <span>Submitted to</span>
              <input
                type="datetime-local"
                value={filters.submittedTo}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFilters((current) => ({
                    ...current,
                    submittedTo: value,
                  }));
                }}
              />
            </label>
            <div className="order-filter-actions">
              <button type="submit">Apply filters</button>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    createdByEmployeeId: props.employeeId,
                  }))
                }
              >
                Created by me
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilters(initialFilters);
                  setAppliedFilters(initialFilters);
                  setFilterError(null);
                }}
              >
                Clear
              </button>
            </div>
            {filterError ? (
              <p className="order-filter-error" role="alert">
                {filterError}
              </p>
            ) : null}
          </form>
          <OrdersList
            branchId={props.branchId}
            filters={appliedFilters}
            reloadSequence={reloadSequence}
            onReload={() => setReloadSequence((value) => value + 1)}
          />
        </>
      ) : (
        <section className="orders-boundary">
          <CircleAlert aria-hidden="true" size={25} />
          <p className="eyebrow">ACCESS BOUNDARY</p>
          <h3>Order view permission required</h3>
          <p>
            The order list is not requested or displayed without{" "}
            <code>orders.view</code> for this branch.
          </p>
        </section>
      )}

      <dialog
        ref={entryDialog}
        className="order-entry"
        aria-labelledby="order-entry-title"
        onCancel={() => setEntryOpen(false)}
        onClose={() => {
          setEntryOpen(false);
          entryTrigger.current?.focus();
        }}
      >
        {entryOpen ? (
          <OrderEntry
            branchId={props.branchId}
            restaurantId={props.restaurantId}
            tables={tableItems}
            canUseMenu={props.canViewMenu}
            canUseTables={props.canViewTables}
            onClose={() => setEntryOpen(false)}
            onCreated={() => {
              setReloadSequence((value) => value + 1);
            }}
          />
        ) : null}
      </dialog>
    </div>
  );
}

function OrdersList(props: {
  readonly branchId: string;
  readonly filters: OrderFilters;
  readonly reloadSequence: number;
  readonly onReload: () => void;
}) {
  const [state, setState] = useState<LoadState<readonly Order[]>>({
    kind: "loading",
  });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const query = new URLSearchParams({
      branchId: props.branchId,
      closure: "active",
      pageSize: "50",
    });
    if (props.filters.approval) query.set("approval", props.filters.approval);
    if (props.filters.fulfilment)
      query.set("fulfilment", props.filters.fulfilment);
    if (props.filters.tableId) query.set("tableId", props.filters.tableId);
    if (props.filters.createdByEmployeeId)
      query.set("createdByEmployeeId", props.filters.createdByEmployeeId);
    const from = localDateTimeToIso(props.filters.submittedFrom);
    const to = localDateTimeToIso(props.filters.submittedTo);
    if (from) query.set("submittedFrom", from);
    if (to) query.set("submittedTo", to);

    void getJson(
      `/api/v1/staff/orders?${query.toString()}`,
      ordersPageSchema,
      abortController.signal,
    )
      .then((page) => {
        if (!abortController.signal.aborted) {
          setState({ kind: "ready", data: page.items });
        }
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setState((current) =>
          current.kind === "ready" || current.kind === "stale"
            ? {
                kind: "stale",
                data: current.data,
                message: errorMessage(error),
              }
            : { kind: "error", message: errorMessage(error) },
        );
      });
    return () => abortController.abort();
  }, [props.branchId, props.filters, props.reloadSequence]);

  if (state.kind === "loading") {
    return (
      <div className="orders-loading" role="status">
        <RefreshCw className="is-spinning" aria-hidden="true" size={20} />
        Loading active orders…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="orders-boundary">
        <CircleAlert aria-hidden="true" size={25} />
        <p className="eyebrow">DATA UNAVAILABLE</p>
        <h3>Active orders could not be loaded</h3>
        <p>{state.message}</p>
        <button type="button" onClick={props.onReload}>
          Reload orders
        </button>
      </section>
    );
  }

  return (
    <section className="orders-results" aria-labelledby="active-orders-title">
      <header>
        <div>
          <p className="eyebrow">CURRENT RESULTS</p>
          <h3 id="active-orders-title">Active orders</h3>
        </div>
        <button type="button" onClick={props.onReload}>
          <RefreshCw aria-hidden="true" size={17} />
          Reload
        </button>
      </header>
      {state.kind === "stale" ? (
        <p className="orders-stale" role="status">
          <CircleAlert aria-hidden="true" size={17} />
          Reload failed. These are the last verified results and may be stale.
        </p>
      ) : null}
      {state.data.length === 0 ? (
        <div className="orders-empty">
          <Clock3 aria-hidden="true" size={24} />
          <h4>No active orders match these filters</h4>
          <p>Change the filters or wait for the next submission.</p>
        </div>
      ) : (
        <ul className="orders-list">
          {state.data.map((order) => (
            <li key={order.id}>
              <div className="order-reference-cell">
                <strong>{order.reference}</strong>
                <span>{formatSubmittedAt(order.submittedAt)}</span>
              </div>
              <div>
                <span className="order-cell-label">Table</span>
                <strong>{order.tableCode}</strong>
              </div>
              <div>
                <span className="order-cell-label">Items</span>
                <strong>
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                </strong>
              </div>
              <div>
                <span className="order-cell-label">Created by</span>
                <strong>
                  {order.creatorType === "guest"
                    ? (order.customerName ?? "Guest")
                    : order.createdByEmployeeId
                      ? `Staff …${order.createdByEmployeeId.slice(-6)}`
                      : "Staff"}
                </strong>
              </div>
              <div>
                <span className="order-cell-label">Elapsed</span>
                <strong>{elapsedTime(order.submittedAt, now)}</strong>
              </div>
              <div className="order-state-cell">
                <span className="order-state">{lifecycleLabel(order)}</span>
                {order.cancellationRequested ? (
                  <span className="order-request-state">
                    Cancellation requested
                  </span>
                ) : null}
              </div>
              <strong className="order-total">
                {formatMoney(order.total.amount, order.total.currency)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderEntry(props: {
  readonly branchId: string;
  readonly restaurantId: string | null;
  readonly tables: readonly Table[];
  readonly canUseMenu: boolean;
  readonly canUseTables: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const [menu, setMenu] = useState<
    LoadState<{
      readonly dishes: readonly Dish[];
      readonly menuVersion: number;
    }>
  >({ kind: "loading" });
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dishId, setDishId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<readonly string[]>(
    [],
  );
  const [configuration, setConfiguration] = useState<
    LoadState<{
      readonly groups: readonly OptionGroup[];
      readonly override: BranchOverride;
    }>
  >({ kind: "loading" });
  const [draft, setDraft] = useState<readonly DraftItem[]>([]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<
    "idle" | "pending" | "failed" | "conflict" | "success"
  >("idle");
  const [createdReference, setCreatedReference] = useState<string | null>(null);
  const idempotencyKey = useRef<string | undefined>(undefined);

  const usableTables = props.tables.filter(
    (table) =>
      table.status === "active" &&
      !table.outOfService &&
      (table.derivedState === "available" || table.derivedState === "occupied"),
  );

  useEffect(() => {
    if (!props.restaurantId || !props.canUseMenu) return;
    const abortController = new AbortController();
    void getJson(
      `/api/v1/staff/restaurants/${props.restaurantId}/menu/dishes`,
      dishesPageSchema,
      abortController.signal,
    )
      .then((result) => {
        if (!abortController.signal.aborted) {
          setMenu({
            kind: "ready",
            data: {
              dishes: result.items
                .filter((dish) => dish.status === "active" && dish.available)
                .sort(
                  (left, right) =>
                    left.displayOrder - right.displayOrder ||
                    left.name.localeCompare(right.name),
                ),
              menuVersion: result.menuVersion,
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setMenu({ kind: "error", message: errorMessage(error) });
        }
      });
    return () => abortController.abort();
  }, [props.canUseMenu, props.restaurantId]);

  useEffect(() => {
    if (!dishId) {
      setConfiguration({ kind: "loading" });
      return;
    }
    const abortController = new AbortController();
    setConfiguration({ kind: "loading" });
    void Promise.all([
      getJson(
        `/api/v1/staff/menu/dishes/${dishId}/option-groups`,
        optionGroupsPageSchema,
        abortController.signal,
      ),
      getJson(
        `/api/v1/staff/branches/${props.branchId}/menu/dishes/${dishId}/override`,
        branchOverrideSchema,
        abortController.signal,
      ),
    ])
      .then(([groups, override]) => {
        if (!abortController.signal.aborted) {
          setConfiguration({
            kind: "ready",
            data: { groups: groups.items, override },
          });
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setConfiguration({ kind: "error", message: errorMessage(error) });
        }
      });
    return () => abortController.abort();
  }, [dishId, props.branchId]);

  const selectedDish =
    menu.kind === "ready"
      ? menu.data.dishes.find((dish) => dish.id === dishId)
      : undefined;
  const groups =
    configuration.kind === "ready" ? configuration.data.groups : [];
  const effectivePrice =
    configuration.kind === "ready" && configuration.data.override.price
      ? configuration.data.override.price
      : selectedDish?.basePrice;

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelectedOptionIds((current) => {
      const groupIds = group.options.map((option) => option.id);
      if (group.maximum === 1) {
        if (group.minimum === 0 && current.includes(optionId)) {
          return current.filter((value) => value !== optionId);
        }
        return [
          ...current.filter((value) => !groupIds.includes(value)),
          optionId,
        ];
      }
      return current.includes(optionId)
        ? current.filter((value) => value !== optionId)
        : [...current, optionId];
    });
  }

  function addDraftItem() {
    if (!selectedDish || configuration.kind !== "ready" || !effectivePrice) {
      setEntryError("Choose a dish after its current options have loaded.");
      return;
    }
    if (
      !configuration.data.override.visible ||
      configuration.data.override.available === false
    ) {
      setEntryError("This dish is not currently orderable in this branch.");
      return;
    }
    const activeGroups = groups.map((group) => ({
      ...group,
      options: group.options.filter((option) => option.status === "active"),
    }));
    const invalidGroup = activeGroups.find((group) => {
      const count = group.options.filter((option) =>
        selectedOptionIds.includes(option.id),
      ).length;
      return count < group.minimum || count > group.maximum;
    });
    if (invalidGroup) {
      setEntryError(
        `${invalidGroup.name} requires between ${invalidGroup.minimum} and ${invalidGroup.maximum} selections.`,
      );
      return;
    }
    const selectedOptions = activeGroups
      .flatMap((group) => group.options)
      .filter((option) => selectedOptionIds.includes(option.id));
    const estimatedUnitAmount =
      Number(effectivePrice.amount) +
      selectedOptions.reduce(
        (sum, option) => sum + Number(option.priceDelta.amount),
        0,
      );
    setDraft((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        dish: selectedDish,
        quantity,
        optionIds: selectedOptions.map((option) => option.id),
        optionNames: selectedOptions.map((option) => option.name),
        note: note.trim() || undefined,
        estimatedUnitAmount,
        currency: effectivePrice.currency,
      },
    ]);
    setEntryError(null);
    setDishId("");
    setQuantity(1);
    setNote("");
    setSelectedOptionIds([]);
  }

  async function submit() {
    if (menu.kind !== "ready" || !tableId || draft.length === 0) {
      setEntryError("Choose a table and add at least one item.");
      return;
    }
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    setSubmission("pending");
    try {
      const order = await createOrder(
        {
          tableId,
          menuVersion: menu.data.menuVersion,
          customerName: customerName.trim() || undefined,
          items: draft.map((item) => ({
            dishId: item.dish.id,
            quantity: item.quantity,
            optionIds: item.optionIds,
            note: item.note,
          })),
        },
        key,
      );
      idempotencyKey.current = undefined;
      setSubmission("success");
      setCreatedReference(order.reference);
      props.onCreated();
    } catch (error) {
      setSubmission(
        error instanceof OrdersRequestError && error.code === "menu_changed"
          ? "conflict"
          : "failed",
      );
      setEntryError(errorMessage(error));
    }
  }

  const estimatedTotal = draft.reduce(
    (sum, item) => sum + item.estimatedUnitAmount * item.quantity,
    0,
  );
  const currency = draft[0]?.currency ?? "USD";

  return (
    <div className="order-entry__content">
      <header>
        <div>
          <p className="eyebrow">STAFF ORDER ENTRY</p>
          <h2 id="order-entry-title">Create order</h2>
          <p>
            The server rechecks table state, menu version, options, prices, and
            totals before acceptance.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close order entry"
          onClick={props.onClose}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      {!props.restaurantId || !props.canUseMenu || !props.canUseTables ? (
        <section className="order-entry-boundary">
          <CircleAlert aria-hidden="true" size={22} />
          <h3>Order-entry data is unavailable</h3>
          <p>
            This action requires <code>orders.create</code>, plus access to the
            established current menu and table endpoints for this branch.
          </p>
        </section>
      ) : submission === "success" ? (
        <section className="order-entry-success" role="status">
          <p className="eyebrow">ORDER ACCEPTED</p>
          <h3>{createdReference}</h3>
          <p>The new order is now available in the active-order list.</p>
          <button type="button" onClick={props.onClose}>
            Return to orders
          </button>
        </section>
      ) : (
        <>
          <div className="order-entry-fields">
            <label>
              <span>Table</span>
              <select
                value={tableId}
                onChange={(event) => setTableId(event.currentTarget.value)}
              >
                <option value="">Choose a table</option>
                {usableTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.code} · {table.derivedState.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Customer name (optional)</span>
              <input
                maxLength={100}
                value={customerName}
                onChange={(event) => setCustomerName(event.currentTarget.value)}
              />
            </label>
          </div>

          {menu.kind === "loading" ? (
            <p className="order-entry-loading" role="status">
              Loading current menu…
            </p>
          ) : menu.kind === "error" ? (
            <p className="order-entry-error" role="alert">
              {menu.message}
            </p>
          ) : (
            <section className="order-item-builder">
              <label>
                <span>Dish</span>
                <select
                  value={dishId}
                  onChange={(event) => {
                    setDishId(event.currentTarget.value);
                    setSelectedOptionIds([]);
                  }}
                >
                  <option value="">Choose a dish</option>
                  {menu.data.dishes.map((dish) => (
                    <option key={dish.id} value={dish.id}>
                      {dish.name} ·{" "}
                      {formatMoney(
                        dish.basePrice.amount,
                        dish.basePrice.currency,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              {dishId && configuration.kind === "loading" ? (
                <p className="order-entry-loading" role="status">
                  Checking branch price and options…
                </p>
              ) : null}
              {configuration.kind === "error" ? (
                <p className="order-entry-error" role="alert">
                  {configuration.message}
                </p>
              ) : null}
              {configuration.kind === "ready"
                ? groups.map((group) => (
                    <fieldset key={group.id}>
                      <legend>
                        {group.name} · {group.minimum}–{group.maximum}
                      </legend>
                      {group.options
                        .filter((option) => option.status === "active")
                        .sort(
                          (left, right) =>
                            left.displayOrder - right.displayOrder,
                        )
                        .map((option) => (
                          <label key={option.id} className="order-option">
                            <input
                              type={
                                group.minimum === 1 && group.maximum === 1
                                  ? "radio"
                                  : "checkbox"
                              }
                              name={`entry-${group.id}`}
                              checked={selectedOptionIds.includes(option.id)}
                              onChange={() => toggleOption(group, option.id)}
                            />
                            <span>{option.name}</span>
                            <span>
                              {formatMoney(
                                option.priceDelta.amount,
                                option.priceDelta.currency,
                              )}
                            </span>
                          </label>
                        ))}
                    </fieldset>
                  ))
                : null}
              <div className="order-entry-fields">
                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        Math.max(
                          1,
                          Math.min(99, Number(event.currentTarget.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Preparation note (optional)</span>
                  <input
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="order-add-item"
                disabled={!dishId || configuration.kind !== "ready"}
                onClick={addDraftItem}
              >
                Add item
              </button>
            </section>
          )}

          {draft.length > 0 ? (
            <section className="order-draft" aria-labelledby="draft-title">
              <h3 id="draft-title">Order review</h3>
              <ul>
                {draft.map((item) => (
                  <li key={item.clientId}>
                    <div>
                      <strong>
                        {item.quantity}× {item.dish.name}
                      </strong>
                      {item.optionNames.length > 0 ? (
                        <span>{item.optionNames.join(", ")}</span>
                      ) : null}
                      {item.note ? <span>{item.note}</span> : null}
                    </div>
                    <strong>
                      {formatEstimatedMoney(
                        item.estimatedUnitAmount * item.quantity,
                        item.currency,
                      )}
                    </strong>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) =>
                          current.filter(
                            (candidate) => candidate.clientId !== item.clientId,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="order-draft-total">
                <span>Estimated total</span>
                <strong>
                  {formatEstimatedMoney(estimatedTotal, currency)}
                </strong>
              </div>
              <p>
                The accepted receipt uses the server-calculated total and
                immutable item snapshot.
              </p>
            </section>
          ) : null}

          {entryError ? (
            <p className="order-entry-error" role="alert">
              {submission === "conflict"
                ? "The menu changed. Close this entry, reload current menu data, and review the order again."
                : entryError}
            </p>
          ) : null}
          <button
            className="order-submit"
            type="button"
            disabled={
              submission === "pending" || !tableId || draft.length === 0
            }
            onClick={() => void submit()}
          >
            {submission === "pending" ? "Submitting…" : "Submit order"}
          </button>
        </>
      )}
    </div>
  );
}
