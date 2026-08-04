import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  actionButtonVariants,
  iconButtonVariants,
  staggerContainerVariants,
  fadeUpItemVariants,
} from "./motion.js";

const problemSchema = z.object({
  title: z.string().optional(),
  detail: z.string().nullable().optional(),
});

function csrfToken(): string {
  return decodeURIComponent(
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice("rms_csrf=".length) ?? "",
  );
}

async function responseError(response: Response): Promise<string> {
  const parsed = problemSchema.safeParse(
    await response.json().catch(() => ({})),
  );
  return (
    parsed.data?.detail ??
    parsed.data?.title ??
    "The latest information could not be loaded. Retry when connected."
  );
}

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

const notificationSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  restaurantId: z.uuid(),
  branchId: z.uuid().nullable(),
  type: z.string(),
  groupKey: z.string(),
  title: z.string(),
  body: z.string(),
  taskState: z.enum(["unhandled", "handled"]),
  readAt: z.iso.datetime().nullable(),
  acknowledgedAt: z.iso.datetime().nullable(),
  occurredAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
const notificationListSchema = z.object({
  items: z.array(notificationSchema),
});
type NotificationItem = z.infer<typeof notificationSchema>;

export function NotificationInboxWorkspace({
  branchId,
}: {
  readonly branchId: string;
}) {
  const [items, setItems] = useState<readonly NotificationItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "stale">("loading");
  const [message, setMessage] = useState("");
  const [streamState, setStreamState] = useState<
    "connecting" | "live" | "reconnecting"
  >("connecting");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/v1/staff/notifications?branchId=${encodeURIComponent(branchId)}&limit=100`,
          {
            credentials: "same-origin",
            ...(signal ? { signal } : {}),
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
        const parsed = notificationListSchema.parse(await response.json());
        setItems(parsed.items);
        setState("ready");
        setMessage("");
      } catch (error) {
        if (signal?.aborted) return;
        setState((current) => (current === "loading" ? "stale" : current));
        setMessage(
          error instanceof Error ? error.message : "Inbox unavailable.",
        );
      }
    },
    [branchId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    if (typeof EventSource === "undefined") return () => controller.abort();
    const stream = new EventSource(
      `/api/v1/staff/notification-events?branchId=${encodeURIComponent(branchId)}`,
      { withCredentials: true },
    );
    stream.addEventListener("open", () => setStreamState("live"));
    stream.addEventListener("notification", () => void load());
    stream.addEventListener("replay-gap", () => void load());
    stream.addEventListener("session-ended", () => {
      setStreamState("reconnecting");
      setMessage("Your staff session ended. Reload after signing in again.");
      stream.close();
    });
    stream.addEventListener("error", () => setStreamState("reconnecting"));
    return () => {
      controller.abort();
      stream.close();
    };
  }, [branchId, load]);

  const update = async (
    notificationId: string,
    action: "read" | "acknowledge",
  ) => {
    try {
      const response = await fetch(
        `/api/v1/staff/notifications/${notificationId}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) {
        setMessage(await responseError(response));
        return;
      }
      await load();
    } catch {
      setMessage(
        "The notification could not be updated. Retry when connected.",
      );
    }
  };

  return (
    <div className="workspace__content insight-workspace">
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">DURABLE INBOX · 30-DAY HISTORY</p>
          <h2>Notifications that survive reconnects</h2>
          <p>
            Live messages are hints. This inbox is the authoritative record of
            work addressed to your active identity and branch permissions.
          </p>
        </div>
        <motion.button
          type="button"
          className="secondary-action"
          onClick={() => void load()}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          <RefreshCw aria-hidden="true" size={18} /> Reload inbox
        </motion.button>
      </section>
      <p className="stream-status" role="status">
        <span
          aria-hidden="true"
          className={`stream-status__dot stream-status__dot--${streamState}`}
        />
        {streamState === "live"
          ? "Live hints connected"
          : streamState === "reconnecting"
            ? "Reconnecting — inbox remains authoritative"
            : "Connecting live hints"}
      </p>
      {message ? (
        <div className="inline-alert" role="alert">
          {message}
        </div>
      ) : null}
      {state === "loading" ? (
        <div className="empty-panel" aria-live="polite">
          Loading your inbox…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-panel">
          <Bell aria-hidden="true" />
          <h3>No notifications need attention</h3>
          <p>
            New eligible events will appear here after the worker processes
            them.
          </p>
        </div>
      ) : (
        <motion.ol
          className="notification-list"
          initial="initial"
          animate="enter"
          variants={staggerContainerVariants}
        >
          {items.map((item) => (
            <motion.li
              className={`notification-card notification-card--${item.taskState}`}
              key={item.id}
              variants={fadeUpItemVariants}
            >
              <div>
                <span className="status-pill">{item.taskState}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <time dateTime={item.occurredAt}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.occurredAt))}
                </time>
              </div>
              <div className="notification-card__actions">
                {!item.readAt ? (
                  <motion.button
                    type="button"
                    onClick={() => void update(item.id, "read")}
                    whileHover="hover"
                    whileTap="tap"
                    variants={actionButtonVariants}
                  >
                    Mark read
                  </motion.button>
                ) : null}
                {item.taskState === "unhandled" ? (
                  <motion.button
                    type="button"
                    onClick={() => void update(item.id, "acknowledge")}
                    whileHover="hover"
                    whileTap="tap"
                    variants={actionButtonVariants}
                  >
                    <CheckCheck aria-hidden="true" size={17} /> Acknowledge
                  </motion.button>
                ) : null}
              </div>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </div>
  );
}

const dashboardSchema = z.object({
  branch: z.object({
    branchName: z.string(),
    restaurantName: z.string(),
    timeZone: z.string(),
    currency: z.string(),
  }),
  activeOrders: z.number().int().nonnegative(),
  orderStates: z.array(
    z.object({
      fulfilment: z.string(),
      financial: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  occupiedTables: z.number().int().nonnegative(),
  pendingRequests: z.object({
    bills: z.number().int().nonnegative(),
    cancellations: z.number().int().nonnegative(),
  }),
  kitchenWaiting: z.array(
    z.object({
      workItemId: z.uuid(),
      orderReference: z.string(),
      itemName: z.string(),
      state: z.enum(["queued", "preparing"]),
      waitingSince: z.iso.datetime(),
    }),
  ),
  dailySales: z.array(
    z.object({
      currency: z.string(),
      grossAmount: z.string(),
      paidAmount: z.string(),
      refundedAmount: z.string(),
      cancelledAmount: z.string(),
    }),
  ),
  enabledWidgets: z.array(z.enum(["orders", "tables", "kitchen", "payments"])),
});
type Dashboard = z.infer<typeof dashboardSchema>;

function elapsed(instant: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(instant).getTime()) / 60_000),
  );
  return minutes < 60
    ? `${minutes} min elapsed`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min elapsed`;
}

export function DashboardWorkspace({
  branchId,
  canView,
}: {
  readonly branchId: string;
  readonly canView: boolean;
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(canView);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/staff/branches/${branchId}/dashboard`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setDashboard(dashboardSchema.parse(await response.json()));
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Dashboard projection unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, canView]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;
  return (
    <section className="dashboard-section" aria-labelledby="dashboard-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">BRANCH DASHBOARD</p>
          <h2 id="dashboard-title">Current branch activity</h2>
          <p>
            Kitchen wait time is elapsed time only; no urgency threshold is
            applied.
          </p>
        </div>
        <motion.button
          type="button"
          className="icon-button"
          aria-label="Reload dashboard"
          onClick={() => void load()}
          whileHover="hover"
          whileTap="tap"
          variants={iconButtonVariants}
        >
          <RefreshCw aria-hidden="true" size={18} />
        </motion.button>
      </div>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      {loading && !dashboard ? (
        <div className="empty-panel">Loading the reporting projection…</div>
      ) : dashboard ? (
        <>
          <p className="projection-context">
            {dashboard.branch.restaurantName} · {dashboard.branch.branchName} ·{" "}
            {dashboard.branch.timeZone}
          </p>
          <motion.div
            className="metric-grid"
            initial="initial"
            animate="enter"
            variants={staggerContainerVariants}
          >
            {dashboard.enabledWidgets.includes("orders") ? (
              <motion.article variants={fadeUpItemVariants}>
                <span>Active orders</span>
                <strong>{dashboard.activeOrders}</strong>
              </motion.article>
            ) : null}
            {dashboard.enabledWidgets.includes("tables") ? (
              <motion.article variants={fadeUpItemVariants}>
                <span>Occupied tables</span>
                <strong>{dashboard.occupiedTables}</strong>
              </motion.article>
            ) : null}
            {dashboard.enabledWidgets.includes("orders") ||
            dashboard.enabledWidgets.includes("payments") ? (
              <motion.article variants={fadeUpItemVariants}>
                <span>Pending requests</span>
                <strong>
                  {dashboard.pendingRequests.bills +
                    dashboard.pendingRequests.cancellations}
                </strong>
              </motion.article>
            ) : null}
            {dashboard.enabledWidgets.includes("payments") ? (
              <motion.article variants={fadeUpItemVariants}>
                <span>Recorded today</span>
                <strong>
                  {dashboard.dailySales[0]
                    ? `${dashboard.dailySales[0].paidAmount} ${dashboard.dailySales[0].currency}`
                    : "—"}
                </strong>
              </motion.article>
            ) : null}
          </motion.div>
          {dashboard.enabledWidgets.includes("kitchen") ? (
            <div className="waiting-list">
              <h3>Kitchen elapsed time</h3>
              {dashboard.kitchenWaiting.length === 0 ? (
                <p>No queued or preparing items.</p>
              ) : (
                dashboard.kitchenWaiting.map((item) => (
                  <div key={item.workItemId}>
                    <Clock3 aria-hidden="true" size={18} />
                    <span>
                      <strong>{item.orderReference}</strong> · {item.itemName}
                    </span>
                    <span>{elapsed(item.waitingSince)}</span>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </>
      ) : error ? null : (
        <div className="empty-panel">
          No dashboard projection is available for this branch.
        </div>
      )}
    </section>
  );
}

const reportSchema = z.object({
  rows: z.array(
    z.object({
      restaurantName: z.string(),
      branchName: z.string(),
      orderId: z.uuid(),
      orderReference: z.string(),
      businessDate: z.iso.date(),
      currency: z.string(),
      grossAmount: z.string(),
      cancelledAmount: z.string(),
      paidAmount: z.string(),
      refundedAmount: z.string(),
      paymentMethod: z.enum(["cash", "card"]).nullable(),
      orderState: z.enum(["active", "completed", "cancelled"]),
    }),
  ),
  totals: z.array(
    z.object({
      currency: z.string(),
      grossAmount: z.string(),
      cancelledAmount: z.string(),
      paidAmount: z.string(),
      refundedAmount: z.string(),
    }),
  ),
  page: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
type SalesReport = z.infer<typeof reportSchema>;

export function SalesReportWorkspace({
  branchId,
  timeZone,
  canView,
}: {
  readonly branchId: string;
  readonly timeZone: string;
  readonly canView: boolean;
}) {
  const [from, setFrom] = useState(() => dateInTimeZone(timeZone));
  const [to, setTo] = useState(() => dateInTimeZone(timeZone));
  const [method, setMethod] = useState("");
  const [orderState, setOrderState] = useState("");
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(canView);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const query = new URLSearchParams({
      branchId,
      dateFrom: from,
      dateTo: to,
      ...(method ? { paymentMethod: method } : {}),
      ...(orderState ? { orderState } : {}),
      page: String(page),
      pageSize: "50",
    });
    try {
      const response = await fetch(`/api/v1/staff/reports/sales?${query}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseError(response));
      setReport(reportSchema.parse(await response.json()));
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Sales report unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, canView, from, method, orderState, page, to]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return <PermissionBoundary title="Report permission required" />;
  }
  return (
    <div className="workspace__content insight-workspace">
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">
            RECORDED TRANSACTIONS · NO CURRENCY CONVERSION
          </p>
          <h2>Sales report</h2>
          <p>
            Cancelled value and refunded money remain separate, and each row
            identifies the underlying order.
          </p>
        </div>
      </section>
      <form
        className="report-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          void load();
        }}
      >
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.currentTarget.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.currentTarget.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Payment method
          <select
            value={method}
            onChange={(event) => {
              setMethod(event.currentTarget.value);
              setPage(0);
            }}
          >
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </select>
        </label>
        <label>
          Order state
          <select
            value={orderState}
            onChange={(event) => {
              setOrderState(event.currentTarget.value);
              setPage(0);
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <motion.button
          type="submit"
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Apply filters
        </motion.button>
      </form>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      {loading && !report ? (
        <div className="empty-panel" role="status">
          Loading sales for the branch-local date…
        </div>
      ) : null}
      {report?.totals.length ? (
        <div className="report-totals">
          {report.totals.map((total) => (
            <article key={total.currency}>
              <strong>{total.currency}</strong>
              <span>Paid {total.paidAmount}</span>
              <span>Refunded {total.refundedAmount}</span>
              <span>Cancelled {total.cancelledAmount}</span>
            </article>
          ))}
        </div>
      ) : null}
      <p className="table-scroll-hint">
        Scroll the table horizontally to view every column.
      </p>
      <div
        className="data-table-wrap"
        tabIndex={0}
        aria-label="Sales report table. Scroll horizontally to view all columns."
      >
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Origin</th>
              <th>Date</th>
              <th>State</th>
              <th>Paid</th>
              <th>Refunded</th>
              <th>Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {report?.rows.map((row) => (
              <tr key={row.orderId}>
                <td>
                  <span title={`Order ID ${row.orderId}`}>
                    {row.orderReference}
                  </span>
                </td>
                <td>
                  {row.restaurantName} · {row.branchName}
                </td>
                <td>{row.businessDate}</td>
                <td>{row.orderState}</td>
                <td>
                  {row.paidAmount} {row.currency}
                </td>
                <td>
                  {row.refundedAmount} {row.currency}
                </td>
                <td>
                  {row.cancelledAmount} {row.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report?.rows.length === 0 ? (
          <p className="empty-table">No recorded orders match these filters.</p>
        ) : null}
      </div>
      <div className="report-pagination" aria-label="Sales report pages">
        <motion.button
          type="button"
          disabled={!report || report.page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Previous page
        </motion.button>
        <span>Page {(report?.page ?? 0) + 1}</span>
        <motion.button
          type="button"
          disabled={!report?.hasMore}
          onClick={() => setPage((current) => current + 1)}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Next page
        </motion.button>
      </div>
    </div>
  );
}

const auditSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      actorUserId: z.uuid().nullable(),
      action: z.string(),
      targetType: z.string(),
      targetId: z.uuid(),
      branchId: z.uuid().nullable(),
      outcome: z.string(),
      reason: z.string().nullable(),
      before: z.unknown(),
      after: z.unknown(),
      occurredAt: z.iso.datetime(),
    }),
  ),
  page: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export function AuditWorkspace({
  restaurantId,
  branchId,
  canView,
}: {
  readonly restaurantId: string | null;
  readonly branchId: string;
  readonly canView: boolean;
}) {
  const [items, setItems] = useState<z.infer<typeof auditSchema>["items"]>([]);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [auditPage, setAuditPage] = useState({ page: 0, hasMore: false });
  const [error, setError] = useState("");
  const query = useMemo(() => {
    if (!restaurantId) return null;
    return new URLSearchParams({
      restaurantId,
      branchId,
      ...(action ? { action } : {}),
      page: String(page),
      pageSize: "50",
    });
  }, [action, branchId, page, restaurantId]);
  const load = useCallback(async () => {
    if (!canView || !query) return;
    try {
      const response = await fetch(`/api/v1/staff/audit-events?${query}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = auditSchema.parse(await response.json());
      setItems(result.items);
      setAuditPage({ page: result.page, hasMore: result.hasMore });
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Audit history unavailable.",
      );
    }
  }, [canView, query]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return <PermissionBoundary title="Audit permission required" />;
  if (!restaurantId)
    return (
      <PermissionBoundary title="Restaurant scope could not be resolved" />
    );
  return (
    <div className="workspace__content insight-workspace">
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">APPEND-ONLY · REDACTED EVIDENCE</p>
          <h2>Audit history</h2>
          <p>
            Actor, action, target, UTC time, branch, outcome, reason, and
            available before/after evidence.
          </p>
        </div>
      </section>
      <form
        className="audit-filter"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          void load();
        }}
      >
        <label>
          Exact action
          <input
            value={action}
            onChange={(event) => {
              setAction(event.currentTarget.value);
              setPage(0);
            }}
            placeholder="payments.payment_refunded"
          />
        </label>
        <motion.button
          type="submit"
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Search history
        </motion.button>
      </form>
      {error ? (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="empty-panel">No audit evidence matches this scope.</div>
      ) : (
        <motion.ol
          className="audit-list"
          initial="initial"
          animate="enter"
          variants={staggerContainerVariants}
        >
          {items.map((item) => (
            <motion.li key={item.id} variants={fadeUpItemVariants}>
              <div>
                <span className="status-pill">{item.outcome}</span>
                <strong>{item.action}</strong>
              </div>
              <p>
                {item.targetType} · {item.targetId}
              </p>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toISOString()}
              </time>
              {item.reason ? <p>Reason: {item.reason}</p> : null}
              {item.before !== null || item.after !== null ? (
                <details>
                  <summary>Available before/after evidence</summary>
                  <pre>
                    {JSON.stringify(
                      { before: item.before, after: item.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ) : null}
            </motion.li>
          ))}
        </motion.ol>
      )}
      <div className="report-pagination" aria-label="Audit history pages">
        <motion.button
          type="button"
          disabled={auditPage.page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Previous page
        </motion.button>
        <span>Page {auditPage.page + 1}</span>
        <motion.button
          type="button"
          disabled={!auditPage.hasMore}
          onClick={() => setPage((current) => current + 1)}
          whileHover="hover"
          whileTap="tap"
          variants={actionButtonVariants}
        >
          Next page
        </motion.button>
      </div>
    </div>
  );
}

function PermissionBoundary({ title }: { readonly title: string }) {
  return (
    <div className="workspace__content">
      <div className="empty-panel">
        <AlertTriangle aria-hidden="true" />
        <h2>{title}</h2>
        <p>
          The server did not grant the capability required for this workspace.
        </p>
      </div>
    </div>
  );
}
