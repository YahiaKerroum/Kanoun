import { CircleAlert, CreditCard, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";

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

type Ledger = z.infer<typeof ledgerSchema>;
type BillRequest = z.infer<typeof billRequestsSchema>["items"][number];

type QueueState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly items: readonly BillRequest[] }
  | {
      readonly kind: "stale";
      readonly items: readonly BillRequest[];
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

export function PaymentsWorkspace(props: {
  readonly branchId: string;
  readonly canView: boolean;
  readonly canRecord: boolean;
  readonly canRefund: boolean;
}) {
  const [queue, setQueue] = useState<QueueState>({ kind: "loading" });
  const [reloadSequence, setReloadSequence] = useState(0);
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [lookup, setLookup] = useState<
    | { readonly kind: "idle" }
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly ledger: Ledger }
    | { readonly kind: "error"; readonly message: string }
  >({ kind: "idle" });

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

  async function lookupLedger(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const parsed = z.uuid().safeParse(lookupOrderId.trim());
    if (!parsed.success) {
      setLookup({ kind: "error", message: "Enter a valid order identifier." });
      return;
    }
    setLookup({ kind: "loading" });
    try {
      const ledger = await getJson(
        `/api/v1/staff/orders/${encodeURIComponent(parsed.data)}/payment-ledger`,
        ledgerSchema,
      );
      setLookup({ kind: "ready", ledger });
      setLookupOrderId("");
    } catch (error: unknown) {
      setLookup({ kind: "error", message: message(error) });
    }
  }

  if (!props.canView) {
    return (
      <section className="payments-boundary">
        <CircleAlert aria-hidden="true" size={26} />
        <p className="eyebrow">ACCESS BOUNDARY</p>
        <h2>Payment view permission required</h2>
        <p>
          Bill requests and financial history are not requested without{" "}
          <code>payments.view</code> for this branch.
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
          <p className="eyebrow">BRANCH PAYMENT DESK</p>
          <h2>Bill requests</h2>
          <p>
            Authoritative order balances with manually recorded cash or card
            payments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadSequence((value) => value + 1)}
        >
          <RefreshCw aria-hidden="true" size={18} />
          Refresh
        </button>
      </header>

      <p className="payments-live-status" role="status" aria-live="polite">
        {items.length === 0
          ? "No open bill requests."
          : `${items.length} open bill ${items.length === 1 ? "request" : "requests"}.`}
      </p>
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
              <h3>The payment desk is clear</h3>
              <p>New customer bill requests will appear automatically.</p>
            </section>
          ) : (
            <ul className="bill-request-list">
              {items.map((item) => (
                <li key={item.id}>
                  <LedgerSummary ledger={item} />
                  {props.canRecord && !item.payment ? (
                    <RecordPaymentForm
                      ledger={item}
                      onRecorded={() => setReloadSequence((value) => value + 1)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="payment-history-lookup">
        <p className="eyebrow">APPEND-ONLY HISTORY</p>
        <h3>Find an order ledger</h3>
        <form onSubmit={(event) => void lookupLedger(event)}>
          <label htmlFor="payment-order-id">Order identifier</label>
          <div>
            <input
              id="payment-order-id"
              value={lookupOrderId}
              placeholder="UUID"
              onChange={(event) => setLookupOrderId(event.currentTarget.value)}
            />
            <button type="submit" disabled={lookup.kind === "loading"}>
              {lookup.kind === "loading" ? "Finding…" : "Find ledger"}
            </button>
          </div>
        </form>
        {lookup.kind === "error" ? <p role="alert">{lookup.message}</p> : null}
        {lookup.kind === "ready" ? (
          <div className="payment-ledger-result">
            <LedgerSummary ledger={lookup.ledger} />
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
        <span>Financial</span>
        <strong>{ledger.financial.replace("_", " ")}</strong>
      </div>
      {ledger.payment ? (
        <div>
          <span>Original payment</span>
          <strong>
            {formatMoney(ledger.payment.amount)} · {ledger.payment.method}
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
  readonly onRecorded: () => void;
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
      props.onRecorded();
    } catch {
      setState("failed");
    }
  }

  return (
    <form
      className="record-payment-form"
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Method
        <select
          value={method}
          onChange={(event) =>
            setMethod(event.currentTarget.value as "cash" | "card")
          }
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </select>
      </label>
      <label>
        External reference (optional)
        <input
          maxLength={100}
          value={externalReference}
          onChange={(event) => setExternalReference(event.currentTarget.value)}
        />
      </label>
      <label className="financial-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        Confirm receipt of exactly {formatMoney(props.ledger.total)}.
      </label>
      {state === "failed" ? (
        <p role="alert">
          Payment was not recorded. Reload the bill and verify the balance.
        </p>
      ) : null}
      <button type="submit" disabled={!confirmed || state === "pending"}>
        {state === "pending" ? "Recording…" : "Record payment"}
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
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
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
      setState("idle");
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
        Confirm this append-only refund.
      </label>
      {state === "failed" ? (
        <p role="alert">
          Refund was not recorded. Sign in again if recent authentication is
          required, then reload the ledger.
        </p>
      ) : null}
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
