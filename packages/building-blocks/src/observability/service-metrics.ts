import {
  createMetricsRegistry,
  type CounterSeries,
  type GaugeSeries,
  type HistogramSeries,
  type MetricsRegistry,
  type MetricsSnapshot,
} from "./metrics-registry.js";

export type RequestStatusClass = "success" | "client_error" | "server_error";

export type OrderSubmissionOutcome =
  "success" | "conflict" | "duplicate" | "rejected" | "error";

export type PaymentRecordingOutcome =
  "success" | "conflict" | "duplicate" | "rejected" | "error";

export type AuthenticationFailureReason =
  "invalid_credentials" | "rate_limited" | "other";

export type IdempotentOperation =
  "order_submission" | "payment_recording" | "kitchen_serving";

export interface ApiRequestObservation {
  readonly method: string;
  readonly route: string;
  readonly statusClass: RequestStatusClass;
  readonly durationMs: number;
}

export interface PoolSaturation {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
}

export interface OutboxBacklogObservation {
  readonly oldestPendingAgeSeconds: number;
  readonly pendingEvents: number;
  readonly quarantinedEvents: number;
  readonly checkpointAgeSecondsByHandler: Readonly<Record<string, number>>;
}

export type OutboxOutcome = "processed" | "retry_scheduled" | "quarantined";

/**
 * Typed facade over the metrics registry covering the service indicators in
 * docs/operations/observability-and-runbook.md. Label values are bounded by
 * the union types and the callers; tenant identifiers are never labels.
 */
export interface ServiceMetrics {
  readonly registry: MetricsRegistry;
  observeApiRequest(observation: ApiRequestObservation): void;
  setDatabaseReady(ready: boolean): void;
  observeOrderSubmission(outcome: OrderSubmissionOutcome): void;
  observePaymentRecording(outcome: PaymentRecordingOutcome): void;
  observeAuthenticationFailure(reason: AuthenticationFailureReason): void;
  observeQrExchangeFailure(reason: "rejected" | "error"): void;
  observeSupportAccessChange(action: "granted" | "revoked"): void;
  sseConnectionOpened(): void;
  sseConnectionClosed(): void;
  sseReconnected(): void;
  sseReplayGap(): void;
  sseSessionEnded(): void;
  ssePollFailure(): void;
  sseDelivered(itemAgeMs: number): void;
  observePoolQuery(durationMs: number): void;
  countPoolError(): void;
  setPoolSaturation(saturation: PoolSaturation): void;
  countIdempotentDuplicate(operation: IdempotentOperation): void;
  countOutboxOutcome(outcome: OutboxOutcome): void;
  observeOutboxEventAge(eventAgeMs: number): void;
  observeOutboxHandler(handler: string, durationMs: number): void;
  setOutboxBacklog(observation: OutboxBacklogObservation): void;
  countSessionInvalidationFailure(): void;
  countTenantIsolationSignal(): void;
  countPaymentReconciliationFailure(): void;
  setBackupLastSuccessAgeSeconds(ageSeconds: number): void;
  snapshot(): MetricsSnapshot;
}

export function createServiceMetrics(): ServiceMetrics {
  const registry = createMetricsRegistry();

  const apiRequestDuration = new Map<string, HistogramSeries>();
  const handlerDuration = new Map<string, HistogramSeries>();
  const checkpointAge = new Map<string, GaugeSeries>();

  const apiDuration = (observation: ApiRequestObservation): HistogramSeries => {
    const key = `${observation.method}|${observation.route}|${observation.statusClass}`;
    let series = apiRequestDuration.get(key);
    if (!series) {
      series = registry.histogram("api.request_duration_ms", {
        method: observation.method,
        route: observation.route,
        status_class: observation.statusClass,
      });
      apiRequestDuration.set(key, series);
    }
    return series;
  };

  type CommandOutcomeKey =
    "success" | "conflict" | "duplicate" | "rejected" | "error";
  const outcomeCounter = (
    name: string,
  ): Record<CommandOutcomeKey, CounterSeries> => ({
    success: registry.counter(name, { outcome: "success" }),
    conflict: registry.counter(name, { outcome: "conflict" }),
    duplicate: registry.counter(name, { outcome: "duplicate" }),
    rejected: registry.counter(name, { outcome: "rejected" }),
    error: registry.counter(name, { outcome: "error" }),
  });

  const ordersTotal = outcomeCounter("orders.submissions_total");
  const paymentsTotal = outcomeCounter("payments.recordings_total");

  const authFailures: Record<AuthenticationFailureReason, CounterSeries> = {
    invalid_credentials: registry.counter("auth.failures_total", {
      reason: "invalid_credentials",
    }),
    rate_limited: registry.counter("auth.failures_total", {
      reason: "rate_limited",
    }),
    other: registry.counter("auth.failures_total", { reason: "other" }),
  };

  const qrRejections = registry.counter("qr.exchange_failures_total", {
    reason: "rejected",
  });
  const qrErrors = registry.counter("qr.exchange_failures_total", {
    reason: "error",
  });

  const supportGranted = registry.counter("support.access_changes_total", {
    action: "granted",
  });
  const supportRevoked = registry.counter("support.access_changes_total", {
    action: "revoked",
  });

  const sseOpen = registry.gauge("sse.open_connections");
  let openConnections = 0;
  const sseDeliveries = registry.counter("sse.delivered_total");
  const sseDeliveryLatency = registry.histogram("sse.delivery_latency_ms");
  const sseReconnects = registry.counter("sse.reconnects_total");
  const sseReplayGaps = registry.counter("sse.replay_gaps_total");
  const sseSessionEndedTotal = registry.counter("sse.session_ended_total");
  const ssePollFailures = registry.counter("sse.poll_failures_total");

  const poolTotal = registry.gauge("db.pool_connections", { state: "total" });
  const poolIdle = registry.gauge("db.pool_connections", { state: "idle" });
  const poolWaiting = registry.gauge("db.pool_connections", {
    state: "waiting",
  });
  const queryDuration = registry.histogram("db.query_duration_ms");
  const dbErrors = registry.counter("db.errors_total");

  const idempotentDuplicates: Record<IdempotentOperation, CounterSeries> = {
    order_submission: registry.counter(
      "idempotency.duplicates_prevented_total",
      {
        operation: "order_submission",
      },
    ),
    payment_recording: registry.counter(
      "idempotency.duplicates_prevented_total",
      { operation: "payment_recording" },
    ),
    kitchen_serving: registry.counter(
      "idempotency.duplicates_prevented_total",
      {
        operation: "kitchen_serving",
      },
    ),
  };

  const outboxOutcomes: Record<OutboxOutcome, CounterSeries> = {
    processed: registry.counter("outbox.events_total", {
      outcome: "processed",
    }),
    retry_scheduled: registry.counter("outbox.events_total", {
      outcome: "retry_scheduled",
    }),
    quarantined: registry.counter("outbox.events_total", {
      outcome: "quarantined",
    }),
  };

  const outboxOldestAge = registry.gauge("outbox.oldest_pending_age_seconds");
  const outboxEventAge = registry.histogram("outbox.event_age_ms");
  const outboxPending = registry.gauge("outbox.pending_events");
  const outboxQuarantined = registry.gauge("outbox.quarantined_events");

  const databaseReady = registry.gauge("api.database_ready");
  databaseReady.set(1);

  const sessionInvalidationFailures = registry.counter(
    "identity.session_invalidation_failures_total",
  );
  const tenantIsolationSignals = registry.counter(
    "platform.tenant_isolation_signals_total",
  );
  const paymentReconciliationFailures = registry.counter(
    "payments.reconciliation_failures_total",
  );
  const backupAge = registry.gauge("platform.backup_last_success_age_seconds");
  backupAge.set(-1);

  return {
    registry,
    observeApiRequest(observation) {
      registry
        .counter("api.requests_total", {
          method: observation.method,
          route: observation.route,
          status_class: observation.statusClass,
        })
        .inc();
      apiDuration(observation).observe(observation.durationMs);
    },
    setDatabaseReady(ready) {
      databaseReady.set(ready ? 1 : 0);
    },
    observeOrderSubmission(outcome) {
      ordersTotal[outcome].inc();
    },
    observePaymentRecording(outcome) {
      paymentsTotal[outcome].inc();
    },
    observeAuthenticationFailure(reason) {
      authFailures[reason].inc();
    },
    observeQrExchangeFailure(reason) {
      (reason === "rejected" ? qrRejections : qrErrors).inc();
    },
    observeSupportAccessChange(action) {
      (action === "granted" ? supportGranted : supportRevoked).inc();
    },
    sseConnectionOpened() {
      openConnections += 1;
      sseOpen.set(openConnections);
    },
    sseConnectionClosed() {
      openConnections = Math.max(0, openConnections - 1);
      sseOpen.set(openConnections);
    },
    sseReconnected() {
      sseReconnects.inc();
    },
    sseReplayGap() {
      sseReplayGaps.inc();
    },
    sseSessionEnded() {
      sseSessionEndedTotal.inc();
    },
    ssePollFailure() {
      ssePollFailures.inc();
    },
    sseDelivered(itemAgeMs) {
      sseDeliveries.inc();
      sseDeliveryLatency.observe(itemAgeMs);
    },
    observePoolQuery(durationMs) {
      queryDuration.observe(durationMs);
    },
    countPoolError() {
      dbErrors.inc();
    },
    setPoolSaturation(saturation) {
      poolTotal.set(saturation.total);
      poolIdle.set(saturation.idle);
      poolWaiting.set(saturation.waiting);
    },
    countIdempotentDuplicate(operation) {
      idempotentDuplicates[operation].inc();
    },
    countOutboxOutcome(outcome) {
      outboxOutcomes[outcome].inc();
    },
    observeOutboxEventAge(eventAgeMs) {
      outboxEventAge.observe(eventAgeMs);
    },
    observeOutboxHandler(handler, durationMs) {
      let series = handlerDuration.get(handler);
      if (!series) {
        series = registry.histogram("outbox.handler_duration_ms", {
          handler,
        });
        handlerDuration.set(handler, series);
      }
      series.observe(durationMs);
    },
    setOutboxBacklog(observation) {
      outboxOldestAge.set(observation.oldestPendingAgeSeconds);
      outboxPending.set(observation.pendingEvents);
      outboxQuarantined.set(observation.quarantinedEvents);
      for (const [handler, ageSeconds] of Object.entries(
        observation.checkpointAgeSecondsByHandler,
      )) {
        let series = checkpointAge.get(handler);
        if (!series) {
          series = registry.gauge("projections.checkpoint_age_seconds", {
            handler,
          });
          checkpointAge.set(handler, series);
        }
        series.set(ageSeconds);
      }
    },
    countSessionInvalidationFailure() {
      sessionInvalidationFailures.inc();
    },
    countTenantIsolationSignal() {
      tenantIsolationSignals.inc();
    },
    countPaymentReconciliationFailure() {
      paymentReconciliationFailures.inc();
    },
    setBackupLastSuccessAgeSeconds(ageSeconds) {
      backupAge.set(ageSeconds);
    },
    snapshot() {
      return registry.snapshot();
    },
  };
}
