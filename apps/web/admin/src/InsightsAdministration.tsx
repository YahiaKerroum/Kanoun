import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

const problemSchema = z.object({
  title: z.string().optional(),
  detail: z.string().nullable().optional(),
});

async function responseError(response: Response): Promise<string> {
  const problem = problemSchema.safeParse(
    await response.json().catch(() => ({})),
  );
  return (
    problem.data?.detail ??
    problem.data?.title ??
    "The requested evidence could not be loaded."
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
      submittedAt: z.iso.datetime(),
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

const auditSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      branchId: z.uuid().nullable(),
      actorUserId: z.uuid().nullable(),
      action: z.string(),
      targetType: z.string(),
      targetId: z.uuid(),
      outcome: z.enum(["attempted", "succeeded", "failed"]),
      reason: z.string().nullable(),
      before: z.unknown(),
      after: z.unknown(),
      occurredAt: z.iso.datetime(),
    }),
  ),
  page: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

const gapSchema = z.object({
  items: z.array(
    z.object({
      eventId: z.uuid(),
      notificationType: z.string(),
      requiredPermission: z.string(),
      reason: z.string(),
      attemptedAt: z.iso.datetime(),
    }),
  ),
});

interface RestaurantOption {
  readonly id: string;
  readonly name: string;
}

interface BranchOption {
  readonly id: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly status: "active" | "inactive";
}

function dateInTimeZone(timeZone = "UTC"): string {
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

export function InsightsAdministration({
  restaurants,
  branches,
  activeBranchId,
  canViewReports,
  canViewCrossBranch,
  canViewAudit,
  canViewTenantAudit,
  canManageFeatures,
}: {
  readonly restaurants: readonly RestaurantOption[];
  readonly branches: readonly BranchOption[];
  readonly activeBranchId: string | null;
  readonly canViewReports: boolean;
  readonly canViewCrossBranch: boolean;
  readonly canViewAudit: boolean;
  readonly canViewTenantAudit: boolean;
  readonly canManageFeatures: boolean;
}) {
  const activeBranch = branches.find((branch) => branch.id === activeBranchId);
  const [restaurantId, setRestaurantId] = useState(
    canViewCrossBranch
      ? ""
      : (activeBranch?.restaurantId ?? restaurants[0]?.id ?? ""),
  );
  const [auditRestaurantId, setAuditRestaurantId] = useState(
    canViewTenantAudit
      ? ""
      : (activeBranch?.restaurantId ?? restaurants[0]?.id ?? ""),
  );
  const [reportBranchId, setReportBranchId] = useState(
    canViewCrossBranch ? "" : (activeBranchId ?? ""),
  );
  const [auditBranchId, setAuditBranchId] = useState(
    canViewTenantAudit ? "" : (activeBranchId ?? ""),
  );
  const [dateFrom, setDateFrom] = useState(() =>
    dateInTimeZone(activeBranch?.timeZone),
  );
  const [dateTo, setDateTo] = useState(() =>
    dateInTimeZone(activeBranch?.timeZone),
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [orderState, setOrderState] = useState("");
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<z.infer<typeof reportSchema> | null>(
    null,
  );
  const [auditItems, setAuditItems] = useState<
    z.infer<typeof auditSchema>["items"]
  >([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [gaps, setGaps] = useState<z.infer<typeof gapSchema>["items"]>([]);
  const [reportError, setReportError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [gapsError, setGapsError] = useState("");
  const [reportLoading, setReportLoading] = useState(canViewReports);
  const [auditLoading, setAuditLoading] = useState(canViewAudit);
  const [gapsLoading, setGapsLoading] = useState(
    canManageFeatures && Boolean(activeBranchId),
  );

  const restaurantBranches = useMemo(
    () =>
      branches.filter(
        (branch) => !restaurantId || branch.restaurantId === restaurantId,
      ),
    [branches, restaurantId],
  );
  const auditRestaurantBranches = useMemo(
    () =>
      branches.filter(
        (branch) =>
          !auditRestaurantId || branch.restaurantId === auditRestaurantId,
      ),
    [auditRestaurantId, branches],
  );

  const loadReport = useCallback(async () => {
    if (!canViewReports) return;
    setReportLoading(true);
    const query = new URLSearchParams({
      dateFrom,
      dateTo,
      ...(restaurantId ? { restaurantId } : {}),
      ...(reportBranchId ? { branchId: reportBranchId } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(orderState ? { orderState } : {}),
      page: String(page),
      pageSize: "25",
    });
    try {
      const response = await fetch(`/api/v1/staff/reports/sales?${query}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseError(response));
      setReport(reportSchema.parse(await response.json()));
      setReportError("");
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Sales report unavailable.",
      );
    } finally {
      setReportLoading(false);
    }
  }, [
    canViewReports,
    dateFrom,
    dateTo,
    orderState,
    page,
    paymentMethod,
    reportBranchId,
    restaurantId,
  ]);

  const loadAudit = useCallback(async () => {
    if (!canViewAudit) return;
    setAuditLoading(true);
    const query = new URLSearchParams({
      ...(auditRestaurantId ? { restaurantId: auditRestaurantId } : {}),
      ...(auditBranchId ? { branchId: auditBranchId } : {}),
      page: String(auditPage),
      pageSize: "25",
    });
    try {
      const response = await fetch(`/api/v1/staff/audit-events?${query}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = auditSchema.parse(await response.json());
      setAuditItems(result.items);
      setAuditPage(result.page);
      setAuditHasMore(result.hasMore);
      setAuditError("");
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : "Audit history unavailable.",
      );
    } finally {
      setAuditLoading(false);
    }
  }, [auditBranchId, auditPage, auditRestaurantId, canViewAudit]);

  const loadGaps = useCallback(async () => {
    if (!canManageFeatures || !activeBranchId) return;
    setGapsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/staff/notification-gaps?branchId=${encodeURIComponent(activeBranchId)}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setGaps(gapSchema.parse(await response.json()).items);
      setGapsError("");
    } catch (error) {
      setGapsError(
        error instanceof Error
          ? error.message
          : "Recipient warnings unavailable.",
      );
    } finally {
      setGapsLoading(false);
    }
  }, [activeBranchId, canManageFeatures]);

  useEffect(() => {
    void Promise.all([loadReport(), loadAudit(), loadGaps()]);
  }, [loadAudit, loadGaps, loadReport]);

  if (!canViewReports && !canViewAudit && !canManageFeatures) return null;

  return (
    <section id="insights" className="admin-section admin-insights">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Authorized operational evidence</p>
          <h3>Reports, audit &amp; notification coverage</h3>
        </div>
        <span>Origin and currency remain visible</span>
      </div>
      <p className="status-line" role="status" aria-live="polite">
        {[reportError, auditError, gapsError].filter(Boolean).join(" ")}
      </p>

      {canViewReports && restaurants.length ? (
        <form
          className="insight-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void loadReport();
          }}
        >
          <label>
            Restaurant
            <select
              value={restaurantId}
              onChange={(event) => {
                setRestaurantId(event.currentTarget.value);
                setReportBranchId("");
                setPage(0);
              }}
            >
              {canViewCrossBranch ? (
                <option value="">All assigned restaurants</option>
              ) : null}
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select
              value={reportBranchId}
              onChange={(event) => {
                setReportBranchId(event.currentTarget.value);
                setPage(0);
              }}
            >
              {canViewCrossBranch ? (
                <option value="">All assigned</option>
              ) : null}
              {restaurantBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.currentTarget.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.currentTarget.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Payment
            <select
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.currentTarget.value);
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
          <button type="submit">Apply evidence filters</button>
        </form>
      ) : null}

      {canViewReports ? (
        <div className="admin-evidence-block" aria-labelledby="sales-evidence">
          <h4 id="sales-evidence">Sales by recorded currency</h4>
          {reportLoading ? (
            <p className="empty-state" role="status">
              Loading authorized sales evidence…
            </p>
          ) : null}
          <div className="evidence-totals">
            {report?.totals.map((total) => (
              <p key={total.currency}>
                <strong>{total.currency}</strong>
                <span>Paid {total.paidAmount}</span>
                <span>Refunded {total.refundedAmount}</span>
                <span>Cancelled {total.cancelledAmount}</span>
              </p>
            ))}
          </div>
          {!reportLoading && !reportError && report?.rows.length === 0 ? (
            <p className="empty-state">No sales match these filters.</p>
          ) : null}
          <p className="table-scroll-hint">
            Scroll the table horizontally to view every column.
          </p>
          <div
            className="admin-table-wrap"
            tabIndex={0}
            aria-label="Sales report table. Scroll horizontally to view all columns."
          >
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Origin</th>
                  <th>Business date</th>
                  <th>State</th>
                  <th>Paid</th>
                  <th>Refunded</th>
                  <th>Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {report?.rows.map((row) => (
                  <tr key={row.orderId}>
                    <td>{row.orderReference}</td>
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
          </div>
          <div className="evidence-pagination" aria-label="Sales report pages">
            <button
              type="button"
              disabled={!report || report.page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous page
            </button>
            <span>Page {(report?.page ?? 0) + 1}</span>
            <button
              type="button"
              disabled={!report?.hasMore}
              onClick={() => setPage((current) => current + 1)}
            >
              Next page
            </button>
          </div>
        </div>
      ) : null}

      {canViewAudit ? (
        <div className="admin-evidence-block" aria-labelledby="audit-evidence">
          <h4 id="audit-evidence">Append-only audit evidence</h4>
          <label className="audit-scope-control">
            Audit scope
            <select
              value={auditRestaurantId}
              onChange={(event) => {
                setAuditRestaurantId(event.currentTarget.value);
                setAuditBranchId("");
                setAuditPage(0);
              }}
            >
              {canViewTenantAudit ? (
                <option value="">Tenant support and security activity</option>
              ) : null}
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="audit-scope-control">
            Audit branch
            <select
              value={auditBranchId}
              onChange={(event) => {
                setAuditBranchId(event.currentTarget.value);
                setAuditPage(0);
              }}
            >
              {canViewTenantAudit || auditRestaurantBranches.length > 1 ? (
                <option value="">All authorized branches</option>
              ) : null}
              {auditRestaurantBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.status}
                </option>
              ))}
            </select>
          </label>
          {auditLoading ? (
            <p className="empty-state" role="status">
              Loading append-only audit evidence…
            </p>
          ) : auditItems.length ? (
            <ol className="admin-audit-list">
              {auditItems.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.action}</strong>
                    <span>{item.outcome}</span>
                  </div>
                  <p>
                    {item.targetType} · {item.targetId}
                  </p>
                  <time dateTime={item.occurredAt}>{item.occurredAt}</time>
                  {item.reason ? <p>Reason: {item.reason}</p> : null}
                  {item.before !== null || item.after !== null ? (
                    <details>
                      <summary>Available redacted evidence</summary>
                      <pre>
                        {JSON.stringify(
                          { before: item.before, after: item.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No audit evidence matches this scope.</p>
          )}
          <div className="evidence-pagination" aria-label="Audit history pages">
            <button
              type="button"
              disabled={auditPage === 0}
              onClick={() =>
                setAuditPage((current) => Math.max(0, current - 1))
              }
            >
              Previous page
            </button>
            <span>Page {auditPage + 1}</span>
            <button
              type="button"
              disabled={!auditHasMore}
              onClick={() => setAuditPage((current) => current + 1)}
            >
              Next page
            </button>
          </div>
        </div>
      ) : null}

      {canManageFeatures ? (
        <div className="admin-evidence-block" aria-labelledby="recipient-gaps">
          <h4 id="recipient-gaps">Critical recipient warnings</h4>
          {gapsLoading ? (
            <p className="empty-state" role="status">
              Checking recipient coverage…
            </p>
          ) : gaps.length ? (
            <ul className="recipient-gap-list">
              {gaps.map((gap) => (
                <li key={gap.eventId}>
                  <strong>{gap.notificationType.replaceAll("_", " ")}</strong>
                  <span>Requires {gap.requiredPermission}</span>
                  <p>{gap.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              No critical workflow currently lacks an eligible recipient.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
