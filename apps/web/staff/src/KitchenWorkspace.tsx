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
import { motion } from "framer-motion";
import {
  actionButtonVariants,
  cardHoverVariants,
  fadeUpItemVariants,
  staggerContainerVariants,
} from "./motion.js";

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
    return "The server returned kitchen data that does not match the published contract.";
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
        <h2>Kitchen access is not assigned</h2>
        <p>
          This workspace requires branch-scoped kitchen viewing or order serving
          permission.
        </p>
      </section>
    );
  }

  return (
    <div className="workspace__content kitchen-workspace">
      <header className="kitchen-heading">
        <div>
          <p className="eyebrow">LIVE SERVICE · AUTHORITATIVE QUEUE</p>
          <h2>Kitchen and serving</h2>
          <p>
            Orders stay grouped from first preparation through whole-order
            readiness. The view reloads after reconnect and every two seconds.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={() => void reload()}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          <RefreshCw aria-hidden="true" size={18} />
          Refresh queue
        </motion.button>
      </header>

      <div className="kitchen-status" aria-live="polite">
        {state.kind === "loading"
          ? "Loading the branch kitchen queue…"
          : state.kind === "error"
            ? state.message
            : `${groups.length} active order${groups.length === 1 ? "" : "s"} · last verified ${state.updatedAt.toLocaleTimeString()}`}
        {feedback ? ` ${feedback}` : ""}
      </div>

      {state.kind === "stale" ? (
        <div className="kitchen-stale" role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <span>
            Live refresh failed. This is the last verified queue and may be
            stale. {state.message}
          </span>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <section className="kitchen-empty">
          <CircleAlert aria-hidden="true" size={26} />
          <h3>Kitchen queue unavailable</h3>
          <p>{state.message}</p>
          <motion.button
            type="button"
            onClick={() => void reload()}
            whileHover="hover"
            whileTap="tap"
            variants={actionButtonVariants}
          >
            Try again
          </motion.button>
        </section>
      ) : state.kind === "loading" ? (
        <section className="kitchen-empty" aria-busy="true">
          <ChefHat aria-hidden="true" size={28} />
          <h3>Preparing the kitchen display</h3>
        </section>
      ) : (
        <>
          <section
            className="ready-orders"
            aria-labelledby="ready-orders-title"
            aria-live="polite"
          >
            <header>
              <div>
                <p className="eyebrow">READY FOR SERVICE</p>
                <h3 id="ready-orders-title">
                  {readyGroups.length} order
                  {readyGroups.length === 1 ? "" : "s"} to collect
                </h3>
              </div>
              <CheckCheck aria-hidden="true" size={25} />
            </header>
            {readyGroups.length === 0 ? (
              <p className="ready-orders__empty">
                Ready orders appear here with their reference and table.
              </p>
            ) : (
              <motion.div
                className="ready-order-grid"
                initial="initial"
                animate="enter"
                variants={staggerContainerVariants}
              >
                {readyGroups.map((group) => (
                  <motion.article
                    key={group.orderId}
                    variants={cardHoverVariants}
                    whileHover="hover"
                  >
                    <div>
                      <strong>{group.reference}</strong>
                      <span>Table {group.tableCode}</span>
                    </div>
                    <span>
                      {group.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      item
                      {group.items.length === 1 ? "" : "s"}
                    </span>
                    {props.canServe ? (
                      <motion.button
                        type="button"
                        disabled={pendingId === group.orderId}
                        onClick={() =>
                          void runAction(
                            group.orderId,
                            () => markServed(group),
                            `${group.reference} was marked served.`,
                          )
                        }
                        whileHover="hover"
                        whileTap="tap"
                        variants={actionButtonVariants}
                      >
                        <Utensils aria-hidden="true" size={18} />
                        {pendingId === group.orderId
                          ? "Marking served…"
                          : "Collect · mark served"}
                      </motion.button>
                    ) : (
                      <span className="kitchen-permission-note">
                        Serving permission required
                      </span>
                    )}
                  </motion.article>
                ))}
              </motion.div>
            )}
          </section>

          <section
            className="kitchen-board"
            aria-labelledby="kitchen-board-title"
          >
            <header>
              <div>
                <p className="eyebrow">PREPARATION BOARD</p>
                <h3 id="kitchen-board-title">Waiting and preparing</h3>
              </div>
              <span>{preparingGroups.length} grouped orders</span>
            </header>
            {preparingGroups.length === 0 ? (
              <div className="kitchen-empty">
                <Clock3 aria-hidden="true" size={26} />
                <h4>No items waiting for preparation</h4>
                <p>New accepted orders will appear automatically.</p>
              </div>
            ) : (
              <motion.div
                className="kitchen-order-grid"
                initial="initial"
                animate="enter"
                variants={staggerContainerVariants}
              >
                {preparingGroups.map((group) => (
                  <motion.article
                    className="kitchen-order"
                    key={group.orderId}
                    variants={cardHoverVariants}
                    whileHover="hover"
                  >
                    <header>
                      <div>
                        <strong>{group.reference}</strong>
                        <span>Table {group.tableCode}</span>
                      </div>
                      <span className="kitchen-elapsed">
                        <Clock3 aria-hidden="true" size={16} />
                        {elapsed(group.submittedAt, now)}
                      </span>
                    </header>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <div className="kitchen-item__title">
                            <strong>
                              {item.quantity}× {item.itemName}
                            </strong>
                            <span
                              className={`kitchen-state kitchen-state--${item.state}`}
                            >
                              {item.state === "queued"
                                ? item.changeKind === "corrected"
                                  ? "Changed · queued"
                                  : "New · queued"
                                : item.state}
                            </span>
                          </div>
                          {item.selectedOptions.length > 0 ? (
                            <p>
                              {item.selectedOptions
                                .map((option) => option.optionName)
                                .join(" · ")}
                            </p>
                          ) : null}
                          {item.note ? (
                            <p className="kitchen-note">
                              <strong>Note:</strong> {item.note}
                            </p>
                          ) : null}
                          <div className="kitchen-item__footer">
                            <span>Waiting {elapsed(item.queuedAt, now)}</span>
                            {props.canUpdate && item.state === "queued" ? (
                              <motion.button
                                type="button"
                                disabled={pendingId === item.id}
                                onClick={() =>
                                  void runAction(
                                    item.id,
                                    () => updateKitchenItem(item, "start"),
                                    `${item.itemName} is preparing.`,
                                  )
                                }
                                whileHover="hover"
                                whileTap="tap"
                                variants={actionButtonVariants}
                              >
                                {pendingId === item.id
                                  ? "Starting…"
                                  : "Start preparation"}
                              </motion.button>
                            ) : props.canUpdate &&
                              item.state === "preparing" ? (
                              <motion.button
                                type="button"
                                disabled={pendingId === item.id}
                                onClick={() =>
                                  void runAction(
                                    item.id,
                                    () => updateKitchenItem(item, "ready"),
                                    `${item.itemName} is ready.`,
                                  )
                                }
                                whileHover="hover"
                                whileTap="tap"
                                variants={actionButtonVariants}
                              >
                                {pendingId === item.id
                                  ? "Finishing…"
                                  : "Mark ready"}
                              </motion.button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </motion.article>
                ))}
              </motion.div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
