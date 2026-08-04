import { CircleAlert, Settings2 } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import type { Order, Table } from "./OrdersWorkspace.js";
import { motion } from "framer-motion";
import { actionButtonVariants } from "./motion.js";

const orderResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});

function csrfToken(): string {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice("rms_csrf=".length) ?? ""
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function command(
  path: string,
  body: unknown,
  idempotencyKey: string,
  expectedVersion?: number,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken(),
      "idempotency-key": idempotencyKey,
      ...(expectedVersion ? { "if-match": `"${expectedVersion}"` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = z
      .object({
        title: z.string(),
        detail: z.string().nullish(),
      })
      .safeParse(await response.json().catch(() => undefined));
    throw new Error(
      problem.success
        ? (problem.data.detail ?? problem.data.title)
        : "The order action could not be completed.",
    );
  }
  orderResponseSchema.parse(await response.json());
}

export function OrderOperations(props: {
  readonly order: Order;
  readonly tables: readonly Table[];
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly canComplete: boolean;
  readonly canCompleteUnpaid: boolean;
  readonly canAssignTables: boolean;
  readonly onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasAction =
    (props.canModify &&
      props.order.closure === "active" &&
      props.order.fulfilment === "not_started" &&
      props.order.financial === "unpaid") ||
    (props.canCancel &&
      props.order.closure === "active" &&
      props.order.fulfilment !== "served") ||
    (props.canComplete &&
      props.order.closure === "active" &&
      props.order.fulfilment === "served" &&
      props.order.financial === "paid") ||
    (props.canCompleteUnpaid &&
      props.order.closure === "active" &&
      props.order.fulfilment === "served" &&
      props.order.financial !== "paid") ||
    (props.canAssignTables && props.order.closure === "active");

  if (!hasAction) return null;

  return (
    <div className="order-operations">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        whileHover="hover"
        whileTap="tap"
        variants={actionButtonVariants}
      >
        <Settings2 aria-hidden="true" size={17} />
        {open ? "Close actions" : "Manage"}
      </motion.button>
      {open ? (
        <div className="order-operation-panel">
          {props.canModify &&
          props.order.closure === "active" &&
          props.order.fulfilment === "not_started" &&
          props.order.financial === "unpaid" ? (
            <CorrectionForm order={props.order} onChanged={props.onChanged} />
          ) : null}
          {props.canAssignTables && props.order.closure === "active" ? (
            <MoveTableForm
              order={props.order}
              tables={props.tables}
              onChanged={props.onChanged}
            />
          ) : null}
          {props.canCancel &&
          props.order.closure === "active" &&
          props.order.fulfilment !== "served" ? (
            <CancelForm order={props.order} onChanged={props.onChanged} />
          ) : null}
          {props.canComplete &&
          props.order.closure === "active" &&
          props.order.fulfilment === "served" &&
          props.order.financial === "paid" ? (
            <CompletionForm
              order={props.order}
              unpaidOverride={false}
              onChanged={props.onChanged}
            />
          ) : null}
          {props.canCompleteUnpaid &&
          props.order.closure === "active" &&
          props.order.fulfilment === "served" &&
          props.order.financial !== "paid" ? (
            <CompletionForm
              order={props.order}
              unpaidOverride
              onChanged={props.onChanged}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CorrectionForm(props: {
  readonly order: Order;
  readonly onChanged: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      props.order.items.map((item) => [item.id, item.quantity]),
    ),
  );
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const [error, setError] = useState("");
  const key = useRef<string | undefined>(undefined);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const items = props.order.items.flatMap((item) => {
      const quantity = quantities[item.id] ?? 0;
      return quantity > 0
        ? [
            {
              dishId: item.dishId,
              quantity,
              optionIds: item.selectedOptions.map((option) => option.optionId),
              note: item.note,
            },
          ]
        : [];
    });
    if (!reason.trim() || items.length === 0) return;
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setError("");
    setState("pending");
    try {
      await command(
        `/api/v1/staff/orders/${encodeURIComponent(props.order.id)}/corrections`,
        {
          menuVersion: Math.max(
            ...props.order.items.map((item) => Number(item.menuVersion)),
          ),
          items,
          reason: reason.trim(),
        },
        idempotencyKey,
        props.order.version,
      );
      key.current = undefined;
      props.onChanged();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "Correction failed. Reload the order and current menu before retrying.",
        ),
      );
      setState("failed");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h4>Correct items</h4>
      <p>
        Set a quantity to zero to remove it. The server reapplies current menu
        rules and preserves this revision.
      </p>
      {props.order.items.map((item) => (
        <label key={item.id}>
          {item.name}
          <input
            type="number"
            min={0}
            max={99}
            value={quantities[item.id] ?? 0}
            onChange={(event) => {
              const quantity = Number(event.currentTarget.value);
              setQuantities((current) => ({
                ...current,
                [item.id]: quantity,
              }));
            }}
          />
        </label>
      ))}
      <label>
        Correction reason
        <textarea
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      {state === "failed" ? <p role="alert">{error}</p> : null}
      <motion.button
        type="submit"
        disabled={!reason.trim() || state === "pending"}
        whileHover="hover"
        whileTap="tap"
        variants={actionButtonVariants}
      >
        {state === "pending" ? "Saving…" : "Save correction"}
      </motion.button>
    </form>
  );
}

function MoveTableForm(props: {
  readonly order: Order;
  readonly tables: readonly Table[];
  readonly onChanged: () => void;
}) {
  const destinations = props.tables.filter(
    (table) =>
      table.id !== props.order.tableId && table.derivedState === "available",
  );
  const [destinationTableId, setDestinationTableId] = useState(
    destinations[0]?.id ?? "",
  );
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const [error, setError] = useState("");
  const key = useRef<string | undefined>(undefined);
  if (destinations.length === 0) return null;

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!destinationTableId) return;
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setError("");
    setState("pending");
    try {
      await command(
        `/api/v1/staff/orders/${encodeURIComponent(props.order.id)}/table-assignment`,
        {
          destinationTableId,
          expectedTableSessionVersion: props.order.tableSessionVersion,
        },
        idempotencyKey,
      );
      key.current = undefined;
      props.onChanged();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "The destination is no longer available. Reload current table states.",
        ),
      );
      setState("failed");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h4>Move table session</h4>
      <label>
        Available destination
        <select
          value={destinationTableId}
          onChange={(event) => setDestinationTableId(event.currentTarget.value)}
        >
          {destinations.map((table) => (
            <option key={table.id} value={table.id}>
              {table.code}
            </option>
          ))}
        </select>
      </label>
      {state === "failed" ? <p role="alert">{error}</p> : null}
      <motion.button
        type="submit"
        disabled={state === "pending"}
        whileHover="hover"
        whileTap="tap"
        variants={actionButtonVariants}
      >
        {state === "pending" ? "Moving…" : "Move entire session"}
      </motion.button>
    </form>
  );
}

function CancelForm(props: {
  readonly order: Order;
  readonly onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const [error, setError] = useState("");
  const key = useRef<string | undefined>(undefined);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!reason.trim() || !confirmed) return;
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setError("");
    setState("pending");
    try {
      await command(
        `/api/v1/staff/orders/${encodeURIComponent(props.order.id)}/cancellation`,
        { reason: reason.trim() },
        idempotencyKey,
        props.order.version,
      );
      key.current = undefined;
      props.onChanged();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "Cancellation failed. Reload the order before retrying.",
        ),
      );
      setState("failed");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h4>Cancel order</h4>
      <label>
        Reason
        <textarea
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <label className="order-operation-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        Confirm cancellation and any required append-only refund.
      </label>
      {state === "failed" ? <p role="alert">{error}</p> : null}
      <button
        className="danger-action"
        type="submit"
        disabled={!reason.trim() || !confirmed || state === "pending"}
      >
        {state === "pending" ? "Cancelling…" : "Cancel order"}
      </button>
    </form>
  );
}

function CompletionForm(props: {
  readonly order: Order;
  readonly unpaidOverride: boolean;
  readonly onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const [error, setError] = useState("");
  const key = useRef<string | undefined>(undefined);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!confirmed || (props.unpaidOverride && !reason.trim())) return;
    const idempotencyKey = key.current ?? crypto.randomUUID();
    key.current = idempotencyKey;
    setError("");
    setState("pending");
    try {
      await command(
        `/api/v1/staff/orders/${encodeURIComponent(props.order.id)}/completion`,
        props.unpaidOverride
          ? {
              unpaidOverrideReason: reason.trim(),
              confirmUnpaidOverride: true,
            }
          : {},
        idempotencyKey,
        props.order.version,
      );
      key.current = undefined;
      props.onChanged();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "Completion failed. Reload fulfilment and payment state before retrying.",
        ),
      );
      setState("failed");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h4>
        {props.unpaidOverride ? "Complete without payment" : "Complete order"}
      </h4>
      {props.unpaidOverride ? (
        <>
          <p className="order-operation-warning">
            <CircleAlert aria-hidden="true" size={18} />
            This critical override requires recent authentication and is
            audited.
          </p>
          <label>
            Override reason
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}
      <label className="order-operation-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        Confirm moving this order to completed history.
      </label>
      {state === "failed" ? <p role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={
          !confirmed ||
          (props.unpaidOverride && !reason.trim()) ||
          state === "pending"
        }
      >
        {state === "pending" ? "Completing…" : "Complete order"}
      </button>
    </form>
  );
}
