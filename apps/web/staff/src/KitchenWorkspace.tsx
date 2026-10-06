import {
  CheckCheck,
  ChefHat,
  CircleAlert,
  Clock3,
  RefreshCw,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { settle } from "./motion.js";

const kitchenItemSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  orderId: z.uuid(),
  orderReference: z.string(),
  orderVersion: z.number().int().positive(),
  orderFulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  orderSubmittedAt: z.iso.datetime(),
  tableId: z.uuid(),
  tableCode: z.string(),
  itemName: z.string(),
  quantity: z.number().int().positive(),
  selectedOptions: z.array(
    z.object({
      groupId: z.uuid(),
      groupName: z.string(),
      optionId: z.uuid(),
      optionName: z.string(),
    }),
  ),
  note: z.string().nullable(),
  changeKind: z.enum(["new", "corrected"]).default("new"),
  correctionId: z.uuid().nullable().default(null),
  state: z.enum(["queued", "preparing", "ready", "cancelled"]),
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  startedByEmployeeId: z.uuid().nullable(),
  readyAt: z.iso.datetime().nullable(),
  readyByEmployeeId: z.uuid().nullable(),
});

const kitchenQueueSchema = z.array(kitchenItemSchema);
const commandItemSchema = kitchenItemSchema.omit({
  orderVersion: true,
  orderFulfilment: true,
  orderSubmittedAt: true,
});
const servedOrderSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  fulfilment: z.literal("served"),
});

type KitchenItem = z.infer<typeof kitchenItemSchema>;
type LoadState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready" | "stale";
      readonly items: readonly KitchenItem[];
      readonly updatedAt: Date;
      readonly message?: string;
    }
  | { readonly kind: "error"; readonly message: string };

interface KitchenOrderGroup {
  readonly orderId: string;
  readonly reference: string;
  readonly tableCode: string;
  readonly orderVersion: number;
  readonly submittedAt: string;
  readonly fulfilment: KitchenItem["orderFulfilment"];
  readonly items: readonly KitchenItem[];
}

class KitchenRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code?: string,
    message = "The kitchen request could not be completed.",
  ) {
    super(message);
    this.name = "KitchenRequestError";
  }
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

async function responseError(response: Response): Promise<KitchenRequestError> {
  const problem = z
    .object({
      code: z.string().optional(),
      title: z.string(),
      detail: z.string().nullable().optional(),
    })
    .safeParse(await response.json().catch(() => undefined));
  return new KitchenRequestError(
    response.status,
    problem.success ? problem.data.code : undefined,
    problem.success
      ? (problem.data.detail ?? problem.data.title)
      : "The kitchen request could not be completed.",
  );
}

async function loadQueue(
  branchId: string,
  signal?: AbortSignal,
): Promise<readonly KitchenItem[]> {
  const query = new URLSearchParams({ branchId });
  const response = await fetch(`/api/v1/staff/kitchen/queue?${query}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw await responseError(response);
  return kitchenQueueSchema.parse(await response.json());
}

async function updateKitchenItem(
  item: KitchenItem,
  action: "start" | "ready",
): Promise<void> {
  const response = await fetch(
    `/api/v1/staff/kitchen/items/${item.id}/${action}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": csrfToken(),
        "idempotency-key": crypto.randomUUID(),
        "if-match": `"${item.version}"`,
      },
      body: "{}",
    },
  );
  if (!response.ok) throw await responseError(response);
  commandItemSchema.parse(await response.json());
}

async function markServed(group: KitchenOrderGroup): Promise<void> {
  const response = await fetch(`/api/v1/staff/orders/${group.orderId}/served`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken(),
      "idempotency-key": crypto.randomUUID(),
      "if-match": `"${group.orderVersion}"`,
    },
    body: "{}",
  });
  if (!response.ok) throw await responseError(response);
  servedOrderSchema.parse(await response.json());
}

function groupQueue(
  items: readonly KitchenItem[],
): readonly KitchenOrderGroup[] {
  const groups = new Map<string, KitchenItem[]>();
  for (const item of items) {
    const group = groups.get(item.orderId) ?? [];
    group.push(item);
    groups.set(item.orderId, group);
  }
  return [...groups.values()].flatMap((groupItems) => {
    const first = groupItems[0];
    if (!first) return [];
    return [
      {
        orderId: first.orderId,
        reference: first.orderReference,
        tableCode: first.tableCode,
        orderVersion: first.orderVersion,
        submittedAt: first.orderSubmittedAt,
        fulfilment: first.orderFulfilment,
        items: groupItems,
      },
    ];
  });
}

function elapsed(value: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function actionError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "The kitchen list came back in an unexpected format. Reload, and contact support if it keeps happening.";
  }
  if (error instanceof KitchenRequestError && error.status === 409) {
    return `${error.message} The queue has been reloaded.`;
  }
  return error instanceof Error
    ? error.message
    : "The action could not be completed.";
}

export function KitchenWorkspace(props: {
  readonly branchId: string;
  readonly canView: boolean;
  readonly canUpdate: boolean;
  readonly canServe: boolean;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const previousReadyOrders = useRef<ReadonlySet<string>>(new Set());
  const targetOrderId = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("order");
    return value !== null && z.uuid().safeParse(value).success ? value : null;
  }, []);

  const reload = useCallback(
    async (signal?: AbortSignal, background = false) => {
      try {
        const items = await loadQueue(props.branchId, signal);
        const readyIds = new Set(
          items
            .filter((item) => item.orderFulfilment === "ready")
            .map((item) => item.orderId),
        );
        if (
          background &&
          [...readyIds].some((id) => !previousReadyOrders.current.has(id))
        ) {
          setFeedback("A new order is ready for service.");
        }
        previousReadyOrders.current = readyIds;
        setState({ kind: "ready", items, updatedAt: new Date() });
      } catch (error) {
        if (signal?.aborted) return;
        const message = actionError(error);
        setState((current) =>
          current.kind === "ready" || current.kind === "stale"
            ? {
                kind: "stale",
                items: current.items,
                updatedAt: current.updatedAt,
                message,
              }
            : { kind: "error", message },
        );
      }
    },
    [props.branchId],
  );

  useEffect(() => {
    const abortController = new AbortController();
    setState({ kind: "loading" });
    void reload(abortController.signal);
    const poll = window.setInterval(() => void reload(undefined, true), 2_000);
    const recover = () => void reload(undefined, true);
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => {
      abortController.abort();
      window.clearInterval(poll);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
    };
  }, [reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const groups = useMemo(
    () =>
      state.kind === "ready" || state.kind === "stale"
        ? groupQueue(state.items)
        : [],
    [state],
  );
  const readyGroups = groups.filter((group) => group.fulfilment === "ready");
  const preparingGroups = groups.filter(
    (group) => group.fulfilment !== "ready",
  );
  const orderedReadyGroups = [...readyGroups].sort((left, right) => {
    if (left.orderId === targetOrderId) return -1;
    if (right.orderId === targetOrderId) return 1;
    return 0;
  });
  const orderedPreparingGroups = [...preparingGroups].sort((left, right) => {
    if (left.orderId === targetOrderId) return -1;
    if (right.orderId === targetOrderId) return 1;
    return 0;
  });
  const selectedGroup = groups.find((group) => group.orderId === targetOrderId);

  async function runAction(
    id: string,
    action: () => Promise<void>,
    success: string,
  ) {
    setPendingId(id);
    setFeedback(null);
    try {
      await action();
      setFeedback(success);
    } catch (error) {
      setFeedback(actionError(error));
    } finally {
      await reload();
      setPendingId(null);
    }
  }

  if (!props.canView && !props.canServe) {
    return (
      <section className="workspace__content kitchen-boundary">
        <CircleAlert aria-hidden="true" size={26} />
        <h2>Kitchen access isn't set up for you</h2>
        <p>
          Ask a manager to give you kitchen or serving access for this branch.
        </p>
      </section>
    );
  }

  const updatedAt =
    state.kind === "ready" || state.kind === "stale"
      ? new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(state.updatedAt)
      : null;

  return (
    <div className="workspace__content kitchen-workspace">
      <header className="kitchen-heading">
        <h2 className="visually-hidden">Kitchen</h2>
        <p>
          Tickets stay together until the whole order is ready. The board
          updates on its own every few seconds.
        </p>
        <button
          className="workspace-action workspace-action--quiet"
          type="button"
          onClick={() => void reload()}
        >
          <RefreshCw aria-hidden="true" size={17} />
          Refresh
        </button>
      </header>

      <p className="kitchen-status" aria-live="polite">
        {state.kind === "loading"
          ? "Loading the kitchen board…"
          : state.kind === "error"
            ? state.message
            : `${groups.length} ${groups.length === 1 ? "order" : "orders"} in the kitchen, updated ${updatedAt ?? ""}.`}
        {feedback ? <strong> {feedback}</strong> : null}
      </p>
      {targetOrderId ? (
        selectedGroup ? (
          <p className="kitchen-route-status" role="status">
            Showing {selectedGroup.reference} for table{" "}
            {selectedGroup.tableCode} first.
          </p>
        ) : (
          <p className="kitchen-route-status" role="status">
            This order has left the kitchen.{" "}
            <a href={`/orders?order=${encodeURIComponent(targetOrderId)}`}>
              Open the order
            </a>
          </p>
        )
      ) : null}

      {state.kind === "stale" ? (
        <div className="kitchen-stale" role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            Couldn’t refresh, so this board may be out of date. {state.message}
          </span>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <section className="kitchen-empty">
          <CircleAlert aria-hidden="true" size={26} />
          <h3>The kitchen board didn’t load</h3>
          <p>{state.message}</p>
          <button
            className="workspace-action"
            type="button"
            onClick={() => void reload()}
          >
            Try again
          </button>
        </section>
      ) : state.kind === "loading" ? (
        <section className="kitchen-empty" aria-busy="true">
          <ChefHat aria-hidden="true" size={28} />
          <h3>Loading the kitchen board</h3>
        </section>
      ) : (
        <>
          <section
            className="ready-orders"
            aria-labelledby="ready-orders-title"
            aria-live="polite"
          >
            <header>
              <CheckCheck aria-hidden="true" size={22} />
              <h3 id="ready-orders-title">
                {readyGroups.length === 0
                  ? "Nothing to collect"
                  : `${readyGroups.length} ${readyGroups.length === 1 ? "order" : "orders"} ready to collect`}
              </h3>
            </header>
            {readyGroups.length === 0 ? (
              <p className="ready-orders__empty">
                When every dish in an order is ready, it moves here for the
                floor to take out.
              </p>
            ) : (
              <ul className="ready-order-grid">
                <AnimatePresence initial={false}>
                  {orderedReadyGroups.map((group) => {
                    const count = group.items.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    );
                    return (
                      <motion.li
                        key={group.orderId}
                        layout
                        className={
                          group.orderId === targetOrderId
                            ? "kitchen-order--selected"
                            : undefined
                        }
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={settle}
                      >
                        <div className="ready-order__who">
                          <strong>{group.tableCode}</strong>
                          <a
                            className="kanoun-ticket__face"
                            href={`/orders?order=${encodeURIComponent(group.orderId)}`}
                          >
                            {group.reference}
                          </a>
                        </div>
                        <span className="ready-order__count">
                          {count} {count === 1 ? "dish" : "dishes"}
                        </span>
                        {props.canServe ? (
                          <button
                            type="button"
                            className="kitchen-action kitchen-action--serve"
                            disabled={pendingId === group.orderId}
                            onClick={() =>
                              void runAction(
                                group.orderId,
                                () => markServed(group),
                                `${group.reference} served.`,
                              )
                            }
                          >
                            <Utensils aria-hidden="true" size={17} />
                            {pendingId === group.orderId
                              ? "Marking served…"
                              : "Mark served"}
                          </button>
                        ) : (
                          <span className="kitchen-permission-note">
                            Floor staff serve this order
                          </span>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section
            className="kitchen-board"
            aria-labelledby="kitchen-board-title"
          >
            <header>
              <h3 id="kitchen-board-title">On the pass</h3>
              <span>
                {preparingGroups.length}{" "}
                {preparingGroups.length === 1 ? "ticket" : "tickets"}
              </span>
            </header>
            {preparingGroups.length === 0 ? (
              <div className="kitchen-empty">
                <Clock3 aria-hidden="true" size={26} />
                <h4>No tickets waiting</h4>
                <p>New orders print here as soon as they are accepted.</p>
              </div>
            ) : (
              <div className="kitchen-order-grid">
                <AnimatePresence initial={false}>
                  {orderedPreparingGroups.map((group) => (
                    <motion.article
                      className={`kitchen-order kanoun-ticket${
                        group.orderId === targetOrderId
                          ? " kitchen-order--selected"
                          : ""
                      }`}
                      key={group.orderId}
                      layout="position"
                      initial={ticketPrint.initial}
                      animate={ticketPrint.enter}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      aria-label={`${group.reference}, table ${group.tableCode}`}
                    >
                      <header>
                        <strong className="kitchen-order__table">
                          {group.tableCode}
                        </strong>
                        <span className="kitchen-order__meta kanoun-ticket__face">
                          <a
                            href={`/orders?order=${encodeURIComponent(group.orderId)}`}
                          >
                            {group.reference}
                          </a>
                          <span className="kitchen-elapsed">
                            <Clock3 aria-hidden="true" size={14} />
                            {elapsed(group.submittedAt, now)}
                          </span>
                        </span>
                      </header>
                      <ul>
                        {group.items.map((item) => (
                          <li
                            key={item.id}
                            className={`kitchen-item kitchen-item--${item.state}`}
                          >
                            <span className="kitchen-item__quantity kanoun-ticket__face">
                              {item.quantity}×
                            </span>
                            <div className="kitchen-item__body">
                              <strong>{item.itemName}</strong>
                              {item.selectedOptions.length > 0 ? (
                                <p>
                                  {item.selectedOptions
                                    .map((option) => option.optionName)
                                    .join(", ")}
                                </p>
                              ) : null}
                              {item.note ? (
                                <p className="kitchen-note">{item.note}</p>
                              ) : null}
                              <span className="kitchen-state">
                                {item.state === "preparing"
                                  ? `Preparing for ${elapsed(item.startedAt ?? item.queuedAt, now)}`
                                  : item.state === "ready"
                                    ? "Ready"
                                    : item.changeKind === "corrected"
                                      ? `Changed, waiting ${elapsed(item.queuedAt, now)}`
                                      : `Waiting ${elapsed(item.queuedAt, now)}`}
                              </span>
                            </div>
                            {props.canUpdate && item.state === "queued" ? (
                              <button
                                type="button"
                                className="kitchen-action"
                                disabled={pendingId === item.id}
                                onClick={() =>
                                  void runAction(
                                    item.id,
                                    () => updateKitchenItem(item, "start"),
                                    `${item.itemName} started.`,
                                  )
                                }
                              >
                                {pendingId === item.id ? "Starting…" : "Start"}
                              </button>
                            ) : props.canUpdate &&
                              item.state === "preparing" ? (
                              <button
                                type="button"
                                className="kitchen-action kitchen-action--ready"
                                disabled={pendingId === item.id}
                                onClick={() =>
                                  void runAction(
                                    item.id,
                                    () => updateKitchenItem(item, "ready"),
                                    `${item.itemName} ready.`,
                                  )
                                }
                              >
                                {pendingId === item.id ? "Finishing…" : "Ready"}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* A new ticket feeds down out of the printer; nothing else on the board moves. */
const ticketPrint = {
  initial: { opacity: 0, y: -10, clipPath: "inset(0 0 100% 0)" },
  enter: {
    opacity: 1,
    y: 0,
    clipPath: "inset(0 0 0% 0)",
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
} as const;
