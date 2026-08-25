import { describe, expect, it } from "vitest";
import { createServiceMetrics } from "./service-metrics.js";

describe("createServiceMetrics", () => {
  it("observes API requests with bounded labels and durations", () => {
    const metrics = createServiceMetrics();
    metrics.observeApiRequest({
      method: "POST",
      route: "/api/v1/public/orders",
      statusClass: "success",
      durationMs: 42,
    });
    const snapshot = metrics.snapshot();
    expect(
      snapshot.counters[
        'api.requests_total{method="POST",route="/api/v1/public/orders",status_class="success"}'
      ],
    ).toBe(1);
    expect(
      snapshot.histograms[
        'api.request_duration_ms{method="POST",route="/api/v1/public/orders",status_class="success"}'
      ]?.count,
    ).toBe(1);
  });

  it("starts with database ready and an unknown backup age", () => {
    const metrics = createServiceMetrics();
    const snapshot = metrics.snapshot();
    expect(snapshot.gauges["api.database_ready"]).toBe(1);
    expect(snapshot.gauges["platform.backup_last_success_age_seconds"]).toBe(
      -1,
    );
    metrics.setDatabaseReady(false);
    expect(metrics.snapshot().gauges["api.database_ready"]).toBe(0);
  });

  it("counts order and payment outcomes per label", () => {
    const metrics = createServiceMetrics();
    metrics.observeOrderSubmission("success");
    metrics.observeOrderSubmission("conflict");
    metrics.observeOrderSubmission("duplicate");
    metrics.observeOrderSubmission("rejected");
    metrics.observeOrderSubmission("error");
    metrics.observePaymentRecording("success");
    metrics.observePaymentRecording("error");
    const counters = metrics.snapshot().counters;
    expect(counters['orders.submissions_total{outcome="success"}']).toBe(1);
    expect(counters['orders.submissions_total{outcome="conflict"}']).toBe(1);
    expect(counters['orders.submissions_total{outcome="duplicate"}']).toBe(1);
    expect(counters['orders.submissions_total{outcome="rejected"}']).toBe(1);
    expect(counters['orders.submissions_total{outcome="error"}']).toBe(1);
    expect(counters['payments.recordings_total{outcome="success"}']).toBe(1);
    expect(counters['payments.recordings_total{outcome="error"}']).toBe(1);
  });

  it("counts authentication and QR failures by reason", () => {
    const metrics = createServiceMetrics();
    metrics.observeAuthenticationFailure("invalid_credentials");
    metrics.observeAuthenticationFailure("rate_limited");
    metrics.observeAuthenticationFailure("other");
    metrics.observeQrExchangeFailure("rejected");
    metrics.observeQrExchangeFailure("error");
    const counters = metrics.snapshot().counters;
    expect(counters['auth.failures_total{reason="invalid_credentials"}']).toBe(
      1,
    );
    expect(counters['auth.failures_total{reason="rate_limited"}']).toBe(1);
    expect(counters['auth.failures_total{reason="other"}']).toBe(1);
    expect(counters['qr.exchange_failures_total{reason="rejected"}']).toBe(1);
    expect(counters['qr.exchange_failures_total{reason="error"}']).toBe(1);
  });

  it("tracks support access changes", () => {
    const metrics = createServiceMetrics();
    metrics.observeSupportAccessChange("granted");
    metrics.observeSupportAccessChange("revoked");
    const counters = metrics.snapshot().counters;
    expect(counters['support.access_changes_total{action="granted"}']).toBe(1);
    expect(counters['support.access_changes_total{action="revoked"}']).toBe(1);
  });

  it("never lets the open SSE connection gauge fall below zero", () => {
    const metrics = createServiceMetrics();
    metrics.sseConnectionClosed();
    expect(metrics.snapshot().gauges["sse.open_connections"]).toBe(0);
    metrics.sseConnectionOpened();
    metrics.sseConnectionOpened();
    metrics.sseConnectionClosed();
    metrics.sseConnectionClosed();
    expect(metrics.snapshot().gauges["sse.open_connections"]).toBe(0);
  });

  it("records SSE delivery counters and latency", () => {
    const metrics = createServiceMetrics();
    metrics.sseDelivered(120);
    metrics.sseReconnected();
    metrics.sseReplayGap();
    metrics.sseSessionEnded();
    metrics.ssePollFailure();
    const snapshot = metrics.snapshot();
    expect(snapshot.counters["sse.delivered_total"]).toBe(1);
    expect(snapshot.histograms["sse.delivery_latency_ms"]?.p50).toBe(120);
    expect(snapshot.counters["sse.reconnects_total"]).toBe(1);
    expect(snapshot.counters["sse.replay_gaps_total"]).toBe(1);
    expect(snapshot.counters["sse.session_ended_total"]).toBe(1);
    expect(snapshot.counters["sse.poll_failures_total"]).toBe(1);
  });

  it("records pool queries, errors, and saturation states", () => {
    const metrics = createServiceMetrics();
    metrics.observePoolQuery(15);
    metrics.countPoolError();
    metrics.setPoolSaturation({ total: 10, idle: 8, waiting: 2 });
    const snapshot = metrics.snapshot();
    expect(snapshot.histograms["db.query_duration_ms"]?.count).toBe(1);
    expect(snapshot.counters["db.errors_total"]).toBe(1);
    expect(snapshot.gauges['db.pool_connections{state="total"}']).toBe(10);
    expect(snapshot.gauges['db.pool_connections{state="idle"}']).toBe(8);
    expect(snapshot.gauges['db.pool_connections{state="waiting"}']).toBe(2);
  });

  it("counts idempotent duplicates per operation", () => {
    const metrics = createServiceMetrics();
    metrics.countIdempotentDuplicate("order_submission");
    metrics.countIdempotentDuplicate("payment_recording");
    metrics.countIdempotentDuplicate("kitchen_serving");
    const counters = metrics.snapshot().counters;
    expect(
      counters[
        'idempotency.duplicates_prevented_total{operation="order_submission"}'
      ],
    ).toBe(1);
    expect(
      counters[
        'idempotency.duplicates_prevented_total{operation="payment_recording"}'
      ],
    ).toBe(1);
    expect(
      counters[
        'idempotency.duplicates_prevented_total{operation="kitchen_serving"}'
      ],
    ).toBe(1);
  });

  it("records outbox outcomes, ages, handler durations, and backlog gauges", () => {
    const metrics = createServiceMetrics();
    metrics.countOutboxOutcome("processed");
    metrics.countOutboxOutcome("retry_scheduled");
    metrics.countOutboxOutcome("quarantined");
    metrics.observeOutboxEventAge(2_500);
    metrics.observeOutboxHandler("notifications", 33);
    metrics.setOutboxBacklog({
      oldestPendingAgeSeconds: 12,
      pendingEvents: 3,
      quarantinedEvents: 1,
      checkpointAgeSecondsByHandler: { notifications: 45 },
    });
    const snapshot = metrics.snapshot();
    expect(snapshot.counters['outbox.events_total{outcome="processed"}']).toBe(
      1,
    );
    expect(
      snapshot.counters['outbox.events_total{outcome="retry_scheduled"}'],
    ).toBe(1);
    expect(
      snapshot.counters['outbox.events_total{outcome="quarantined"}'],
    ).toBe(1);
    expect(snapshot.histograms["outbox.event_age_ms"]?.count).toBe(1);
    expect(
      snapshot.histograms['outbox.handler_duration_ms{handler="notifications"}']
        ?.count,
    ).toBe(1);
    expect(snapshot.gauges["outbox.oldest_pending_age_seconds"]).toBe(12);
    expect(snapshot.gauges["outbox.pending_events"]).toBe(3);
    expect(snapshot.gauges["outbox.quarantined_events"]).toBe(1);
    expect(
      snapshot.gauges[
        'projections.checkpoint_age_seconds{handler="notifications"}'
      ],
    ).toBe(45);
  });

  it("records integrity and platform indicators", () => {
    const metrics = createServiceMetrics();
    metrics.countSessionInvalidationFailure();
    metrics.countTenantIsolationSignal();
    metrics.countPaymentReconciliationFailure();
    metrics.setBackupLastSuccessAgeSeconds(240);
    const snapshot = metrics.snapshot();
    expect(
      snapshot.counters["identity.session_invalidation_failures_total"],
    ).toBe(1);
    expect(snapshot.counters["platform.tenant_isolation_signals_total"]).toBe(
      1,
    );
    expect(snapshot.counters["payments.reconciliation_failures_total"]).toBe(1);
    expect(snapshot.gauges["platform.backup_last_success_age_seconds"]).toBe(
      240,
    );
  });

  it("never exposes tenant identifiers as label values", () => {
    const metrics = createServiceMetrics();
    metrics.observeApiRequest({
      method: "GET",
      route: "/api/v1/staff/branches",
      statusClass: "success",
      durationMs: 5,
    });
    metrics.observeOrderSubmission("success");
    metrics.setOutboxBacklog({
      oldestPendingAgeSeconds: 0,
      pendingEvents: 0,
      quarantinedEvents: 0,
      checkpointAgeSecondsByHandler: { notifications: 0 },
    });
    const snapshot = metrics.snapshot();
    const keys = [
      ...Object.keys(snapshot.counters),
      ...Object.keys(snapshot.gauges),
      ...Object.keys(snapshot.histograms),
    ];
    const uuidPattern =
      /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i;
    expect(keys.some((key) => uuidPattern.test(key))).toBe(false);
  });
});
