import { CircleAlert, CreditCard, RefreshCw, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import { fadeUpItemVariants, staggerContainerVariants } from "./motion.js";

const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+(?:\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const paymentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  amount: moneySchema,
  method: z.enum(["cash", "card"]),
  externalReference: z.string().nullable(),
  recordedAt: z.iso.datetime(),
  recordedByEmployeeId: z.uuid(),
});

const refundSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  paymentId: z.uuid(),
  amount: moneySchema,
  reason: z.string(),
  source: z.enum(["manual", "order_cancellation"]),
  refundedAt: z.iso.datetime(),
  refundedByEmployeeId: z.uuid(),
});

const ledgerSchema = z.object({
  orderId: z.uuid(),
  orderReference: z.string(),
  orderVersion: z.number().int().positive(),
  branchId: z.uuid(),
  tableId: z.uuid(),
  tableCode: z.string(),
  total: moneySchema,
  financial: z.enum(["unpaid", "paid", "partially_refunded", "refunded"]),
  fulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  closure: z.enum(["active", "completed", "cancelled"]),
  payment: paymentSchema.nullable(),
  refunds: z.array(refundSchema),
  refundedAmount: moneySchema,
  netPaidAmount: moneySchema,
});

const billRequestsSchema = z.object({
  items: z.array(
    ledgerSchema.extend({
      id: z.uuid(),
      requestedAt: z.iso.datetime(),
    }),
  ),
});

const paymentOrderSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  tableCode: z.string(),
  total: moneySchema,
  financial: z.enum(["unpaid", "paid", "partially_refunded", "refunded"]),
  fulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  closure: z.enum(["active", "completed", "cancelled"]),
  submittedAt: z.iso.datetime(),
  customerName: z.string().nullable(),
});
const paymentOrdersPageSchema = z.object({
  items: z.array(paymentOrderSummarySchema),
});

type Ledger = z.infer<typeof ledgerSchema>;
type BillRequest = z.infer<typeof billRequestsSchema>["items"][number];
type PaymentOrderSummary = z.infer<typeof paymentOrderSummarySchema>;

type QueueState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly items: readonly BillRequest[] }
  | {
      readonly kind: "stale";
      readonly items: readonly BillRequest[];
      readonly message: string;
    }
  | { readonly kind: "error"; readonly message: string };

type RecentState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly items: readonly PaymentOrderSummary[] }
  | {
      readonly kind: "stale";
      readonly items: readonly PaymentOrderSummary[];
      readonly message: string;
    }
  | { readonly kind: "error"; readonly message: string };

class PaymentsRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaymentsRequestError";
  }
}

async function responseError(response: Response): Promise<Error> {
  const problem = z
    .object({
      title: z.string(),
      detail: z.string().nullish(),
    })
    .safeParse(await response.json().catch(() => undefined));
  return new PaymentsRequestError(
    problem.success
      ? (problem.data.detail ?? problem.data.title)
      : "The payment action could not be completed.",
  );
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

async function getJson<Output>(
  path: string,
  schema: z.ZodType<Output>,
  signal?: AbortSignal,
): Promise<Output> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw await responseError(response);
  return schema.parse(await response.json());
}

async function postJson<Output>(
  path: string,
  body: unknown,
  idempotencyKey: string,
  schema: z.ZodType<Output>,
): Promise<Output> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken(),
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return schema.parse(await response.json());
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The payment workspace could not be refreshed.";
}

function formatMoney(money: { amount: string; currency: string }): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: money.currency,
  }).format(Number(money.amount));
}

function financialLabel(
  financial: "unpaid" | "paid" | "partially_refunded" | "refunded",
): string {
  if (financial === "partially_refunded") return "Partially refunded";
  if (financial === "refunded") return "Refunded";
  if (financial === "paid") return "Paid";
  return "Unpaid";
}

export function PaymentsWorkspace(props: {
  readonly branchId: string;
  readonly canView: boolean;
  readonly canRecord: boolean;
  readonly canRefund: boolean;
  readonly canViewOrders: boolean;
}) {
  const [queue, setQueue] = useState<QueueState>({ kind: "loading" });
  const [recentState, setRecentState] = useState<RecentState>({
    kind: "loading",
  });
  const [reloadSequence, setReloadSequence] = useState(0);
  const [financialFeedback, setFinancialFeedback] = useState<string | null>(
    null,
  );
  const [lookup, setLookup] = useState<
    | { readonly kind: "idle" }
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly ledger: Ledger }
    | { readonly kind: "error"; readonly message: string }
  >({ kind: "idle" });
  const requestedOrderId = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("order");
    return value !== null && z.uuid().safeParse(value).success ? value : null;
  }, []);

  const openLedger = useCallback(async (orderId: string) => {
    setLookup({ kind: "loading" });
    try {
      const ledger = await getJson(
        `/api/v1/staff/orders/${encodeURIComponent(orderId)}/payment-ledger`,
        ledgerSchema,
      );
      setLookup({ kind: "ready", ledger });
    } catch (error: unknown) {
      setLookup({ kind: "error", message: message(error) });
    }
  }, []);

  useEffect(() => {
    if (!props.canView) return;
    let disposed = false;
    let currentAbort: AbortController | undefined;
    const load = () => {
      currentAbort?.abort();
      currentAbort = new AbortController();
      void getJson(
        `/api/v1/staff/payments/bill-requests?branchId=${encodeURIComponent(props.branchId)}`,
        billRequestsSchema,
        currentAbort.signal,
      )
        .then((result) => {
          if (!disposed) setQueue({ kind: "ready", items: result.items });
        })
        .catch((error: unknown) => {
          if (disposed || currentAbort?.signal.aborted) return;
          setQueue((current) =>
            current.kind === "ready" || current.kind === "stale"
              ? {
                  kind: "stale",
                  items: current.items,
                  message: message(error),
                }
              : { kind: "error", message: message(error) },
          );
        });
    };
    load();
    const timer = window.setInterval(load, 2_000);
    const reconnect = () => load();
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      disposed = true;
      currentAbort?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [props.branchId, props.canView, reloadSequence]);

  useEffect(() => {
    if (!requestedOrderId || !props.canView) return;
    void openLedger(requestedOrderId);
  }, [openLedger, props.canView, requestedOrderId]);

  useEffect(() => {
    if (!props.canView || !props.canViewOrders) {
      setRecentState({ kind: "ready", items: [] });
      return;
    }
    let disposed = false;
    const controller = new AbortController();
    void Promise.all([
      getJson(
        `/api/v1/staff/orders?branchId=${encodeURIComponent(props.branchId)}&closure=active&pageSize=50`,
        paymentOrdersPageSchema,
        controller.signal,
      ),
      getJson(
        `/api/v1/staff/orders?branchId=${encodeURIComponent(props.branchId)}&closure=completed&pageSize=20`,
        paymentOrdersPageSchema,
        controller.signal,
      ),
    ])
      .then(([active, completed]) => {
        if (disposed) return;
        const unique = new Map<string, PaymentOrderSummary>();
        for (const order of [...active.items, ...completed.items]) {
          if (order.closure === "active" || order.financial !== "unpaid") {
            unique.set(order.id, order);
          }
        }
        setRecentState({ kind: "ready", items: [...unique.values()] });
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        setRecentState((current) =>
          current.kind === "ready" || current.kind === "stale"
            ? { kind: "stale", items: current.items, message: message(error) }
            : { kind: "error", message: message(error) },
        );
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [props.branchId, props.canView, props.canViewOrders, reloadSequence]);

  if (!props.canView) {
    return (
      <section className="payments-boundary">
        <CircleAlert aria-hidden="true" size={26} />
        <h2>Payment access needed</h2>
        <p>
          Your account can't see bills or payments in this branch. Ask a manager
          to add payment access.
        </p>
      </section>
    );
  }

  const items =
    queue.kind === "ready" || queue.kind === "stale" ? queue.items : [];

  return (
    <div className="workspace__content payments-workspace">
      <header className="payments-heading">
        <div>
          <h2>Payments</h2>
          <p>
            Tables asking for the bill, and what each order still owes. Record
            cash or card payments here.
          </p>
        </div>
        <button
          className="workspace-action workspace-action--quiet"
          type="button"
          onClick={() => setReloadSequence((value) => value + 1)}
        >
          <RefreshCw aria-hidden="true" size={17} />
          Refresh
        </button>
      </header>

      {financialFeedback ? (
        <p className="payments-success" role="status" aria-live="polite">
          {financialFeedback}
        </p>
      ) : null}

      <h3 className="payments-section-title" role="status" aria-live="polite">
        {items.length === 0
          ? "No tables waiting for the bill"
          : `${items.length} ${items.length === 1 ? "table wants" : "tables want"} the bill`}
      </h3>
      {queue.kind === "loading" ? (
        <div className="payments-loading" role="status">
          <RefreshCw className="is-spinning" aria-hidden="true" size={20} />
          Loading bill requests…
        </div>
      ) : queue.kind === "error" ? (
        <section className="payments-boundary">
          <CircleAlert aria-hidden="true" size={24} />
          <h3>Bill requests could not be loaded</h3>
          <p>{queue.message}</p>
        </section>
      ) : (
        <>
          {queue.kind === "stale" ? (
            <p className="payments-stale" role="status">
              <CircleAlert aria-hidden="true" size={17} />
              {queue.message} Showing the last verified list.
            </p>
          ) : null}
          {items.length === 0 ? (
            <section className="payments-empty">
              <CreditCard aria-hidden="true" size={28} />
              <h4>The payment desk is clear</h4>
              <p>When a guest asks for the bill, the table shows up here.</p>
            </section>
          ) : (
            <motion.ul
              className="bill-request-list"
              initial="initial"
              animate="enter"
              variants={staggerContainerVariants}
            >
              {items.map((item) => (
                <motion.li key={item.id} variants={fadeUpItemVariants}>
                  <BillHeader ledger={item} />
                  <button
                    type="button"
                    className="payment-ledger-link"
                    onClick={() => setLookup({ kind: "ready", ledger: item })}
                  >
                    See payments and refunds
                  </button>
                  {props.canRecord && !item.payment ? (
                    <RecordPaymentForm
                      ledger={item}
                      onRecorded={(method) => {
                        setFinancialFeedback(
                          `Paid: ${item.orderReference}, ${formatMoney(item.total)} by ${method}.`,
                        );
                        void openLedger(item.orderId);
                        setReloadSequence((value) => value + 1);
                      }}
                    />
                  ) : null}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </>
      )}

      {props.canViewOrders ? (
        <section
          className="payment-history-lookup"
          aria-labelledby="recent-orders-title"
        >
          <h3 id="recent-orders-title">Unpaid and recent orders</h3>
          <p>Open an order to take payment or record a refund.</p>
          {recentState.kind === "loading" ? (
            <p role="status">Loading recent orders…</p>
          ) : recentState.kind === "error" ? (
            <p role="alert">{recentState.message}</p>
          ) : (
            <>
              {recentState.kind === "stale" ? (
                <p className="payments-stale" role="status">
                  <CircleAlert aria-hidden="true" size={17} />
                  {recentState.message} Showing the last verified order list.
                </p>
              ) : null}
              {recentState.items.length === 0 ? (
                <p>No unpaid or recently paid orders are available.</p>
              ) : (
                <ul className="payment-order-list">
                  {recentState.items.map((order) => (
                    <li key={order.id}>
                      <div>
                        <strong>{order.reference}</strong>
                        <span>Table {order.tableCode}</span>
                        <span>
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(order.submittedAt))}
                        </span>
                      </div>
                      <span className="order-request-state">
                        {financialLabel(order.financial)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openLedger(order.id)}
                      >
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : null}

      {lookup.kind === "idle" ? null : (
        <section
          className="payment-history-lookup payment-history-lookup--open"
          ref={(element) => {
            if (element && lookup.kind === "ready") {
              element.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }}
        >
          <h3>
            {lookup.kind === "ready"
              ? `Payments for ${lookup.ledger.orderReference}`
              : "Payments for this order"}
          </h3>
          {lookup.kind === "loading" ? (
            <p role="status">Loading payments…</p>
          ) : null}
          {lookup.kind === "error" ? (
            <p role="alert">{lookup.message}</p>
          ) : null}
          {lookup.kind === "ready" ? (
            <div className="payment-ledger-result">
              <LedgerSummary ledger={lookup.ledger} />
              {props.canRecord && !lookup.ledger.payment ? (
                <RecordPaymentForm
                  ledger={lookup.ledger}
                  onRecorded={(method) => {
                    setFinancialFeedback(
                      `Paid: ${lookup.ledger.orderReference}, ${formatMoney(lookup.ledger.total)} by ${method}.`,
                    );
                    void openLedger(lookup.ledger.orderId);
                  }}
                />
              ) : null}
              {props.canRefund &&
              lookup.ledger.payment &&
              lookup.ledger.financial !== "refunded" ? (
                <RefundForm
                  ledger={lookup.ledger}
                  onRefunded={(ledger) => setLookup({ kind: "ready", ledger })}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

function BillHeader(props: { readonly ledger: Ledger }) {
  const { ledger } = props;
  return (
    <div className="bill-header">
      <strong className="bill-header__table">{ledger.tableCode}</strong>
      <span className="bill-header__reference">{ledger.orderReference}</span>
      <strong className="bill-header__total">
        {formatMoney(ledger.total)}
      </strong>
      <span
        className={`order-request-state order-request-state--${ledger.financial}`}
      >
        {financialLabel(ledger.financial)}
      </span>
    </div>
  );
}

function LedgerSummary(props: { readonly ledger: Ledger }) {
  const { ledger } = props;
  return (
    <div className="ledger-summary">
      <div>
        <span>Order</span>
        <strong>{ledger.orderReference}</strong>
      </div>
      <div>
        <span>Table</span>
        <strong>{ledger.tableCode}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>{formatMoney(ledger.total)}</strong>
      </div>
      <div>
        <span>Payment</span>
        <strong>{financialLabel(ledger.financial)}</strong>
      </div>
      {ledger.payment ? (
        <div>
          <span>Original payment</span>
          <strong>
            {formatMoney(ledger.payment.amount)} by {ledger.payment.method}
          </strong>
        </div>
      ) : null}
      {ledger.refunds.length > 0 ? (
        <div>
          <span>Refunded</span>
          <strong>{formatMoney(ledger.refundedAmount)}</strong>
        </div>
      ) : null}
    </div>
  );
}

function RecordPaymentForm(props: {
  readonly ledger: Ledger;
  readonly onRecorded: (method: "cash" | "card") => void;
}) {
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [externalReference, setExternalReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "failed" | "success">(
    "idle",
  );
  const key = useRef<string | undefined>(undefined);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!confirmed) return;
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setState("pending");
    try {
      await postJson(
        `/api/v1/staff/orders/${encodeURIComponent(props.ledger.orderId)}/payments`,
        {
          amount: props.ledger.total,
          method,
          ...(externalReference.trim()
            ? { externalReference: externalReference.trim() }
            : {}),
        },
        idempotencyKey,
        z.object({
          payment: paymentSchema,
          order: z.object({
            id: z.uuid(),
            version: z.number().int().positive(),
            financial: z.literal("paid"),
          }),
        }),
      );
      key.current = undefined;
      setState("success");
      props.onRecorded(method);
    } catch {
      setState("failed");
    }
  }

  return (
    <form
      className="record-payment-form"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className="payment-method">
        <legend>How did they pay?</legend>
        {(["cash", "card"] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={`method-${props.ledger.orderId}`}
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
            />
            <span>{value === "cash" ? "Cash" : "Card"}</span>
          </label>
        ))}
      </fieldset>
      {method === "card" ? (
        <label>
          Card slip number (optional)
          <input
            maxLength={100}
            value={externalReference}
            onChange={(event) =>
              setExternalReference(event.currentTarget.value)
            }
          />
        </label>
      ) : null}
      <label className="financial-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        I have received exactly {formatMoney(props.ledger.total)}.
      </label>
      {state === "failed" ? (
        <p role="alert">
          The payment wasn’t recorded. Refresh the bill and check the balance
          before trying again.
        </p>
      ) : null}
      {state === "success" ? <p role="status">Payment recorded.</p> : null}
      <button type="submit" disabled={!confirmed || state === "pending"}>
        {state === "pending"
          ? "Recording…"
          : `Record ${formatMoney(props.ledger.total)} ${method === "cash" ? "in cash" : "by card"}`}
      </button>
    </form>
  );
}

function RefundForm(props: {
  readonly ledger: Ledger;
  readonly onRefunded: (ledger: Ledger) => void;
}) {
  const payment = props.ledger.payment;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "failed" | "success">(
    "idle",
  );
  const key = useRef<string | undefined>(undefined);
  if (!payment) return null;
  const originalPayment = payment;
  const maximumRefund = Number(props.ledger.netPaidAmount.amount);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const parsed = z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
      .safeParse(amount.trim());
    if (
      !parsed.success ||
      Number(parsed.data) <= 0 ||
      Number(parsed.data) > maximumRefund ||
      !reason.trim() ||
      !confirmed
    ) {
      return;
    }
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setState("pending");
    try {
      await postJson(
        `/api/v1/staff/payments/${encodeURIComponent(originalPayment.id)}/refunds`,
        {
          amount: {
            amount: parsed.data,
            currency: originalPayment.amount.currency,
          },
          reason: reason.trim(),
          confirmed: true,
        },
        idempotencyKey,
        z.object({
          refund: refundSchema,
          order: z.object({
            id: z.uuid(),
            version: z.number().int().positive(),
            financial: z.enum(["partially_refunded", "refunded"]),
          }),
        }),
      );
      key.current = undefined;
      setAmount("");
      setReason("");
      setConfirmed(false);
      const next = await getJson(
        `/api/v1/staff/orders/${encodeURIComponent(props.ledger.orderId)}/payment-ledger`,
        ledgerSchema,
      );
      props.onRefunded(next);
      setState("success");
    } catch {
      setState("failed");
    }
  }

  return (
    <form className="refund-form" onSubmit={(event) => void submit(event)}>
      <h4>
        <RotateCcw aria-hidden="true" size={18} />
        Record a refund
      </h4>
      <label>
        Amount ({originalPayment.amount.currency})
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          max={maximumRefund.toFixed(2)}
          step="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.currentTarget.value)}
        />
      </label>
      <label>
        Reason
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <label className="financial-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        I've checked the amount. Refunds can't be undone.
      </label>
      {state === "failed" ? (
        <p role="alert">
          The refund wasn't recorded. Sign in again if asked, then try once
          more.
        </p>
      ) : null}
      {state === "success" ? <p role="status">Refund recorded.</p> : null}
      <button
        type="submit"
        disabled={
          !amount.trim() || !reason.trim() || !confirmed || state === "pending"
        }
      >
        {state === "pending" ? "Recording…" : "Record refund"}
      </button>
    </form>
  );
}
