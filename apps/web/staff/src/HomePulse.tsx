import { useEffect, useState } from "react";
import { z } from "zod";

/*
 * "Needs you now" on Home: a few plain sentences about the service in
 * progress, each linking to the page where it is handled. Every line comes
 * from a list this person can already open, so nothing here widens access.
 */

const orderSchema = z.object({
  id: z.uuid(),
  tableCode: z.string(),
  fulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  submittedAt: z.iso.datetime(),
  cancellationRequested: z.boolean().default(false),
});
const ordersSchema = z.object({ items: z.array(orderSchema) });
const tablesSchema = z.object({
  items: z.array(
    z.object({
      derivedState: z.enum([
        "inactive",
        "out_of_service",
        "occupied",
        "available",
      ]),
    }),
  ),
});
const billRequestsSchema = z.object({
  items: z.array(z.object({ orderId: z.uuid(), tableCode: z.string() })),
});

interface Pulse {
  readonly orders?: z.infer<typeof ordersSchema>["items"];
  readonly tables?: z.infer<typeof tablesSchema>["items"];
  readonly bills?: z.infer<typeof billRequestsSchema>["items"];
}

interface PulseLine {
  readonly key: string;
  readonly href: string;
  readonly text: string;
  readonly tone: "attention" | "done" | "calm";
}

async function load<Output>(
  url: string,
  schema: z.ZodType<Output>,
  signal: AbortSignal,
): Promise<Output | undefined> {
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    return response.ok ? schema.parse(await response.json()) : undefined;
  } catch {
    return undefined;
  }
}

function minutesSince(value: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
}

function ago(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function pulseLines(pulse: Pulse, now: number): readonly PulseLine[] {
  const lines: PulseLine[] = [];
  const open = pulse.orders ?? [];
  const ready = open.filter((order) => order.fulfilment === "ready");
  const cancelling = open.filter((order) => order.cancellationRequested);

  if (ready.length > 0) {
    lines.push({
      key: "ready",
      href: "/kitchen",
      tone: "done",
      text:
        ready.length === 1
          ? `Table ${ready[0]?.tableCode ?? ""}’s order is ready to take out`
          : `${ready.length} orders are ready to take out`,
    });
  }
  if (pulse.bills && pulse.bills.length > 0) {
    lines.push({
      key: "bills",
      href: "/payments",
      tone: "attention",
      text:
        pulse.bills.length === 1
          ? `Table ${pulse.bills[0]?.tableCode ?? ""} asked for the bill`
          : `${pulse.bills.length} tables asked for the bill`,
    });
  }
  if (cancelling.length > 0) {
    lines.push({
      key: "cancel",
      href: `/orders?order=${encodeURIComponent(cancelling[0]?.id ?? "")}`,
      tone: "attention",
      text:
        cancelling.length === 1
          ? `A guest at table ${cancelling[0]?.tableCode ?? ""} asked to cancel`
          : `${cancelling.length} guests asked to cancel an order`,
    });
  }
  if (pulse.orders) {
    const oldest = open
      .filter((order) => order.fulfilment !== "served")
      .reduce<number>(
        (longest, order) =>
          Math.max(longest, minutesSince(order.submittedAt, now)),
        0,
      );
    lines.push({
      key: "open",
      href: "/orders",
      tone: "calm",
      text:
        open.length === 0
          ? "No orders open yet"
          : `${plural(open.length, "order", "orders")} open${
              oldest > 0 ? `, the oldest sent ${ago(oldest)}` : ""
            }`,
    });
  }
  if (pulse.tables) {
    const usable = pulse.tables.filter(
      (table) =>
        table.derivedState === "occupied" || table.derivedState === "available",
    );
    const seated = usable.filter((table) => table.derivedState === "occupied");
    lines.push({
      key: "tables",
      href: "/tables",
      tone: "calm",
      text: `${seated.length} of ${usable.length} tables seated`,
    });
  }
  return lines;
}

export function HomePulse(props: {
  readonly branchId: string;
  readonly canViewOrders: boolean;
  readonly canViewTables: boolean;
  readonly canViewPayments: boolean;
  readonly onNavigate: (href: string) => void;
}) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!props.canViewOrders && !props.canViewTables && !props.canViewPayments)
      return;
    const controller = new AbortController();
    const branch = encodeURIComponent(props.branchId);
    const refresh = async () => {
      const [orders, tables, bills] = await Promise.all([
        props.canViewOrders
          ? load(
              `/api/v1/staff/orders?branchId=${branch}&closure=active&pageSize=50`,
              ordersSchema,
              controller.signal,
            )
          : undefined,
        props.canViewTables
          ? load(
              `/api/v1/staff/branches/${branch}/tables`,
              tablesSchema,
              controller.signal,
            )
          : undefined,
        props.canViewPayments
          ? load(
              `/api/v1/staff/payments/bill-requests?branchId=${branch}`,
              billRequestsSchema,
              controller.signal,
            )
          : undefined,
      ]);
      if (controller.signal.aborted) return;
      setNow(Date.now());
      setPulse({
        ...(orders ? { orders: orders.items } : {}),
        ...(tables ? { tables: tables.items } : {}),
        ...(bills ? { bills: bills.items } : {}),
      });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [
    props.branchId,
    props.canViewOrders,
    props.canViewTables,
    props.canViewPayments,
  ]);

  const lines = pulse ? pulseLines(pulse, now) : [];
  if (pulse !== null && lines.length === 0) return null;

  return (
    <section className="home-pulse" aria-labelledby="home-pulse-title">
      <h2 id="home-pulse-title">Needs you now</h2>
      {pulse === null ? (
        <p className="home-pulse__loading" role="status">
          Checking the floor…
        </p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={line.key} className={`home-pulse__line--${line.tone}`}>
              <a
                href={line.href}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  props.onNavigate(line.href);
                }}
              >
                {line.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
