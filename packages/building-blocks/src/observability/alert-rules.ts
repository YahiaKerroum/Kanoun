import type { MetricsSnapshot } from "./metrics-registry.js";

export type AlertPriority = "critical" | "high" | "medium";

export interface ActiveAlert {
  readonly id: string;
  readonly priority: AlertPriority;
  readonly summary: string;
  readonly sinceUtc: string;
}

export interface AlertSink {
  alertActivated(alert: ActiveAlert): void;
  alertCleared(alert: ActiveAlert): void;
}

export interface AlertEvaluator {
  evaluate(snapshot: MetricsSnapshot): readonly ActiveAlert[];
  readonly active: readonly ActiveAlert[];
}

interface AlertDefinition {
  readonly id: string;
  readonly priority: AlertPriority;
  readonly summary: string;
  active(
    current: MetricsSnapshot,
    previous: MetricsSnapshot | undefined,
    delta: (counterKey: string) => number,
  ): boolean;
}

const SUSTAINED_ORDER_FAILURE_ERRORS = 5;
const OUTBOX_LAG_SECONDS = 300;
const BACKUP_MAX_AGE_SECONDS = 900;
const PROJECTION_LAG_SECONDS = 120;
const RATE_LIMIT_WINDOW_THRESHOLD = 20;

function gaugeValue(
  snapshot: MetricsSnapshot | undefined,
  key: string,
): number | undefined {
  return snapshot?.gauges[key];
}

function counterValue(
  snapshot: MetricsSnapshot | undefined,
  key: string,
): number {
  return snapshot?.counters[key] ?? 0;
}

const DEFINITIONS: readonly AlertDefinition[] = [
  {
    id: "database-unavailable",
    priority: "critical",
    summary:
      "Database readiness is failing; state-changing commands fail closed",
    active: (current) => gaugeValue(current, "api.database_ready") === 0,
  },
  {
    id: "sustained-order-submission-failure",
    priority: "critical",
    summary: `At least ${SUSTAINED_ORDER_FAILURE_ERRORS} order-submission errors with no successes since the previous evaluation`,
    active: (_current, _previous, delta) =>
      delta('orders.submissions_total{outcome="error"}') >=
        SUSTAINED_ORDER_FAILURE_ERRORS &&
      delta('orders.submissions_total{outcome="success"}') === 0,
  },
  {
    id: "backup-restore-point-at-risk",
    priority: "critical",
    summary: `Last successful backup is older than ${BACKUP_MAX_AGE_SECONDS} seconds (RPO 15 minutes)`,
    active: (current) => {
      const age = gaugeValue(
        current,
        "platform.backup_last_success_age_seconds",
      );
      return age !== undefined && age >= 0 && age > BACKUP_MAX_AGE_SECONDS;
    },
  },
  {
    id: "tenant-isolation-signal",
    priority: "critical",
    summary: "A tenant-isolation signal counter increased",
    active: (_current, _previous, delta) =>
      delta("platform.tenant_isolation_signals_total") > 0,
  },
  {
    id: "payment-ledger-integrity",
    priority: "critical",
    summary: "A payment reconciliation check failed",
    active: (_current, _previous, delta) =>
      delta("payments.reconciliation_failures_total") > 0,
  },
  {
    id: "outbox-lag",
    priority: "high",
    summary: `Outbox oldest unprocessed event exceeds ${OUTBOX_LAG_SECONDS} seconds`,
    active: (current) => {
      const age = gaugeValue(current, "outbox.oldest_pending_age_seconds");
      return age !== undefined && age > OUTBOX_LAG_SECONDS;
    },
  },
  {
    id: "quarantine-growth",
    priority: "high",
    summary: "New outbox events entered quarantine",
    active: (_current, _previous, delta) =>
      delta('outbox.events_total{outcome="quarantined"}') > 0,
  },
  {
    id: "sse-outage",
    priority: "high",
    summary:
      "SSE delivery is failing for every connected stream while the database remains ready",
    active: (current, _previous, delta) =>
      gaugeValue(current, "sse.open_connections") === 0 &&
      delta("sse.poll_failures_total") > 0 &&
      gaugeValue(current, "api.database_ready") !== 0,
  },
  {
    id: "permission-invalidation-failure",
    priority: "high",
    summary: "A permission or session invalidation step failed",
    active: (_current, _previous, delta) =>
      delta("identity.session_invalidation_failures_total") > 0,
  },
  {
    id: "projection-lag",
    priority: "medium",
    summary: `A projection checkpoint exceeds ${PROJECTION_LAG_SECONDS} seconds behind`,
    active: (current) =>
      Object.entries(current.gauges).some(
        ([key, value]) =>
          key.startsWith("projections.checkpoint_age_seconds") &&
          value > PROJECTION_LAG_SECONDS,
      ),
  },
  {
    id: "export-failure",
    priority: "medium",
    summary: "A report export failed",
    active: (_current, _previous, delta) =>
      delta("reporting.export_failures_total") > 0,
  },
  {
    id: "elevated-rate-limiting",
    priority: "medium",
    summary: `At least ${RATE_LIMIT_WINDOW_THRESHOLD} rate-limited authentication attempts since the previous evaluation`,
    active: (_current, _previous, delta) =>
      delta('auth.failures_total{reason="rate_limited"}') >=
      RATE_LIMIT_WINDOW_THRESHOLD,
  },
];

export function createAlertEvaluator(sink: AlertSink): AlertEvaluator {
  const activeById = new Map<string, ActiveAlert>();
  let previous: MetricsSnapshot | undefined;

  return {
    evaluate(snapshot: MetricsSnapshot): readonly ActiveAlert[] {
      const delta = (counterKey: string): number =>
        counterValue(snapshot, counterKey) - counterValue(previous, counterKey);

      for (const definition of DEFINITIONS) {
        let isActive: boolean;
        try {
          isActive = definition.active(snapshot, previous, delta);
        } catch {
          isActive = false;
        }
        const existing = activeById.get(definition.id);
        if (isActive && !existing) {
          const alert: ActiveAlert = {
            id: definition.id,
            priority: definition.priority,
            summary: definition.summary,
            sinceUtc: snapshot.capturedAtUtc,
          };
          activeById.set(definition.id, alert);
          sink.alertActivated(alert);
        } else if (!isActive && existing) {
          activeById.delete(definition.id);
          sink.alertCleared(existing);
        }
      }

      previous = snapshot;
      return [...activeById.values()];
    },
    get active(): readonly ActiveAlert[] {
      return [...activeById.values()];
    },
  };
}

export function createLoggingAlertSink(log: {
  error(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
}): AlertSink {
  return {
    alertActivated(alert) {
      log.error(`ALERT ${alert.priority.toUpperCase()} ${alert.id}`, {
        alertId: alert.id,
        priority: alert.priority,
        summary: alert.summary,
        sinceUtc: alert.sinceUtc,
      });
    },
    alertCleared(alert) {
      log.info(`ALERT_CLEARED ${alert.id}`, {
        alertId: alert.id,
        priority: alert.priority,
      });
    },
  };
}
