import { describe, expect, it, vi } from "vitest";
import {
  createAlertEvaluator,
  createLoggingAlertSink,
  type ActiveAlert,
} from "./alert-rules.js";
import type { MetricsSnapshot } from "./metrics-registry.js";

function snapshot(overrides?: {
  counters?: Record<string, number>;
  gauges?: Record<string, number>;
}): MetricsSnapshot {
  return {
    capturedAtUtc: new Date().toISOString(),
    counters: overrides?.counters ?? {},
    gauges: overrides?.gauges ?? {},
    histograms: {},
  };
}

function recordingSink() {
  const activated: ActiveAlert[] = [];
  const cleared: ActiveAlert[] = [];
  return {
    activated,
    cleared,
    alertActivated: (alert: ActiveAlert) => activated.push(alert),
    alertCleared: (alert: ActiveAlert) => cleared.push(alert),
  };
}

describe("createAlertEvaluator", () => {
  it("returns no alerts for a healthy snapshot", () => {
    const evaluator = createAlertEvaluator(recordingSink());
    expect(
      evaluator.evaluate(snapshot({ gauges: { "api.database_ready": 1 } })),
    ).toEqual([]);
  });

  it("activates and clears database-unavailable", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({ gauges: { "api.database_ready": 0 } }));
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "database-unavailable",
    ]);
    expect(evaluator.active).toHaveLength(1);

    evaluator.evaluate(snapshot({ gauges: { "api.database_ready": 1 } }));
    expect(sink.cleared.map((alert) => alert.id)).toEqual([
      "database-unavailable",
    ]);
    expect(evaluator.active).toEqual([]);
  });

  it("raises sustained-order-submission-failure on error deltas without successes", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(
      snapshot({
        counters: {
          'orders.submissions_total{outcome="error"}': 2,
          'orders.submissions_total{outcome="success"}': 1,
        },
      }),
    );
    expect(sink.activated).toHaveLength(0);

    evaluator.evaluate(
      snapshot({
        counters: {
          'orders.submissions_total{outcome="error"}': 7,
          'orders.submissions_total{outcome="success"}': 1,
        },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "sustained-order-submission-failure",
    ]);
  });

  it("does not raise sustained failure when successes accompany errors", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({
        counters: {
          'orders.submissions_total{outcome="error"}': 9,
          'orders.submissions_total{outcome="success"}': 3,
        },
      }),
    );
    expect(sink.activated).toHaveLength(0);
  });

  it("raises backup-restore-point-at-risk only past the RPO threshold", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(
      snapshot({
        gauges: { "platform.backup_last_success_age_seconds": 900 },
      }),
    );
    expect(sink.activated).toHaveLength(0);
    evaluator.evaluate(
      snapshot({
        gauges: { "platform.backup_last_success_age_seconds": 901 },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "backup-restore-point-at-risk",
    ]);
  });

  it("does not treat the unknown backup age (-1) as an alert", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(
      snapshot({ gauges: { "platform.backup_last_success_age_seconds": -1 } }),
    );
    expect(sink.activated).toHaveLength(0);
  });

  it("raises critical integrity signals from counter deltas", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({
        counters: {
          "platform.tenant_isolation_signals_total": 1,
          "payments.reconciliation_failures_total": 2,
        },
      }),
    );
    expect(sink.activated.map((alert) => alert.id).sort()).toEqual([
      "payment-ledger-integrity",
      "tenant-isolation-signal",
    ]);
    expect(sink.activated.every((alert) => alert.priority === "critical")).toBe(
      true,
    );
  });

  it("raises outbox-lag above the threshold", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(
      snapshot({ gauges: { "outbox.oldest_pending_age_seconds": 301 } }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual(["outbox-lag"]);
    expect(sink.activated[0]?.priority).toBe("high");
  });

  it("raises quarantine-growth from quarantined deltas", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({
        counters: { 'outbox.events_total{outcome="quarantined"}': 1 },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "quarantine-growth",
    ]);
  });

  it("does not raise sse-outage while the database is unready", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({
        gauges: { "api.database_ready": 0 },
        counters: { "sse.poll_failures_total": 4 },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "database-unavailable",
    ]);
  });

  it("raises projection-lag for any checkpoint gauge past the threshold", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(
      snapshot({
        gauges: {
          "projections.checkpoint_age_seconds{handler=notifications}": 121,
        },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual(["projection-lag"]);
    expect(sink.activated[0]?.priority).toBe("medium");
  });

  it("raises elevated-rate-limiting at twenty rate-limited attempts", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({
        counters: { 'auth.failures_total{reason="rate_limited"}': 19 },
      }),
    );
    expect(sink.activated).toHaveLength(0);
    evaluator.evaluate(
      snapshot({
        counters: { 'auth.failures_total{reason="rate_limited"}': 39 },
      }),
    );
    expect(sink.activated.map((alert) => alert.id)).toEqual([
      "elevated-rate-limiting",
    ]);
  });

  it("clears a delta alert once the counter stops increasing", () => {
    const sink = recordingSink();
    const evaluator = createAlertEvaluator(sink);
    evaluator.evaluate(snapshot({}));
    evaluator.evaluate(
      snapshot({ counters: { "reporting.export_failures_total": 1 } }),
    );
    expect(sink.activated).toHaveLength(1);
    expect(evaluator.active).toHaveLength(1);
    evaluator.evaluate(
      snapshot({ counters: { "reporting.export_failures_total": 1 } }),
    );
    expect(sink.cleared.map((alert) => alert.id)).toEqual(["export-failure"]);
    expect(evaluator.active).toHaveLength(0);
  });
});

describe("createLoggingAlertSink", () => {
  it("logs activation at error level and clearing at info level", () => {
    const error = vi.fn();
    const info = vi.fn();
    const sink = createLoggingAlertSink({ error, info });
    const alert: ActiveAlert = {
      id: "outbox-lag",
      priority: "high",
      summary: "Outbox oldest unprocessed event exceeds 300 seconds",
      sinceUtc: "2026-08-20T00:00:00.000Z",
    };
    sink.alertActivated(alert);
    sink.alertCleared(alert);
    expect(error).toHaveBeenCalledWith("ALERT HIGH outbox-lag", {
      alertId: "outbox-lag",
      priority: "high",
      summary: alert.summary,
      sinceUtc: alert.sinceUtc,
    });
    expect(info).toHaveBeenCalledWith("ALERT_CLEARED outbox-lag", {
      alertId: "outbox-lag",
      priority: "high",
    });
  });
});
