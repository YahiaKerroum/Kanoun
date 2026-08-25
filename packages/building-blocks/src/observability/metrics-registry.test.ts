import { describe, expect, it } from "vitest";
import { createMetricsRegistry } from "./metrics-registry.js";

describe("createMetricsRegistry", () => {
  it("counts increments with a default of one", () => {
    const registry = createMetricsRegistry();
    const series = registry.counter("orders.submissions_total", {
      outcome: "success",
    });
    series.inc();
    series.inc();
    series.inc(3);
    expect(
      registry.snapshot().counters[
        'orders.submissions_total{outcome="success"}'
      ],
    ).toBe(5);
  });

  it("ignores negative and non-finite counter deltas", () => {
    const registry = createMetricsRegistry();
    const series = registry.counter("orders.submissions_total");
    series.inc(-1);
    series.inc(Number.POSITIVE_INFINITY);
    series.inc(Number.NaN);
    expect(
      registry.snapshot().counters["orders.submissions_total"],
    ).toBeUndefined();
  });

  it("stores the latest gauge value", () => {
    const registry = createMetricsRegistry();
    const series = registry.gauge("db.pool_connections", { state: "idle" });
    series.set(4);
    series.set(2);
    series.set(Number.NaN);
    expect(
      registry.snapshot().gauges['db.pool_connections{state="idle"}'],
    ).toBe(2);
  });

  it("rejects invalid metric names", () => {
    const registry = createMetricsRegistry();
    expect(() => registry.counter("9bad")).toThrow(/Invalid metric name/);
    expect(() => registry.counter("Bad")).toThrow(/Invalid metric name/);
    expect(() => registry.gauge("bad name")).toThrow(/Invalid metric name/);
  });

  it("sanitizes label values and truncates them to 128 characters", () => {
    const registry = createMetricsRegistry();
    registry.counter("api.requests_total", { route: "a/b?c=d e" }).inc();
    registry.counter("api.requests_total", { route: "x".repeat(300) }).inc();
    const snapshot = registry.snapshot();
    expect(Object.keys(snapshot.counters)).toEqual([
      'api.requests_total{route="a/b_c_d_e"}',
      `api.requests_total{route="${"x".repeat(128)}"}`,
    ]);
  });

  it("treats empty labels like no labels", () => {
    const registry = createMetricsRegistry();
    registry.counter("orders.submissions_total", {}).inc();
    registry.counter("orders.submissions_total").inc();
    expect(registry.snapshot().counters["orders.submissions_total"]).toBe(2);
  });

  it("summarizes histogram samples with cumulative totals and percentiles", () => {
    const registry = createMetricsRegistry();
    const series = registry.histogram("api.request_duration_ms");
    for (let value = 1; value <= 100; value += 1) {
      series.observe(value);
    }
    const summary = registry.snapshot().histograms["api.request_duration_ms"];
    expect(summary).toBeDefined();
    expect(summary?.count).toBe(100);
    expect(summary?.sum).toBe(5050);
    expect(summary?.max).toBe(100);
    expect(summary?.p50).toBe(50);
    expect(summary?.p95).toBe(95);
    expect(summary?.p99).toBe(99);
  });

  it("keeps cumulative counts after the reservoir wraps", () => {
    const registry = createMetricsRegistry();
    const series = registry.histogram("api.request_duration_ms");
    for (let value = 1; value <= 5_000; value += 1) {
      series.observe(value % 100);
    }
    const summary = registry.snapshot().histograms["api.request_duration_ms"];
    expect(summary?.count).toBe(5_000);
    expect(summary?.max).toBe(99);
    expect(summary?.p50).toBeGreaterThan(0);
    expect(summary?.p50).toBeLessThanOrEqual(99);
  });

  it("ignores negative and non-finite histogram observations", () => {
    const registry = createMetricsRegistry();
    const series = registry.histogram("api.request_duration_ms");
    series.observe(-5);
    series.observe(Number.POSITIVE_INFINITY);
    const summary = registry.snapshot().histograms["api.request_duration_ms"];
    expect(summary).toMatchObject({ count: 0, sum: 0, max: 0 });
  });

  it("returns empty histograms for an empty registry", () => {
    const registry = createMetricsRegistry();
    const series = registry.histogram("api.request_duration_ms");
    const summary = registry.snapshot().histograms["api.request_duration_ms"];
    expect(summary).toMatchObject({
      count: 0,
      sum: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    });
    series.observe(10);
  });

  it("drops new series beyond the per-name cap and reports the drop", () => {
    const registry = createMetricsRegistry();
    for (let index = 0; index < 512; index += 1) {
      registry.counter("api.requests_total", { route: `r${index}` }).inc();
    }
    const dropped = registry.counter("api.requests_total", {
      route: "overflow",
    });
    dropped.inc();
    const snapshot = registry.snapshot();
    expect(
      snapshot.counters['api.requests_total{route="overflow"}'],
    ).toBeUndefined();
    expect(
      snapshot.counters['metrics.dropped_series{metric="api.requests_total"}'],
    ).toBe(1);
    expect(Object.keys(snapshot.counters)).toHaveLength(513);
  });

  it("caps series independently per metric name", () => {
    const registry = createMetricsRegistry();
    for (let index = 0; index < 512; index += 1) {
      registry.counter("api.requests_total", { route: `r${index}` }).inc();
    }
    registry.counter("orders.submissions_total", { outcome: "success" }).inc();
    const snapshot = registry.snapshot();
    expect(
      snapshot.counters['orders.submissions_total{outcome="success"}'],
    ).toBe(1);
    expect(
      snapshot.counters['metrics.dropped_series{metric="api.requests_total"}'],
    ).toBeUndefined();
  });

  it("sorts snapshot keys deterministically and freezes the payload", () => {
    const registry = createMetricsRegistry();
    registry.counter("z.metric").inc();
    registry.counter("a.metric").inc();
    registry.gauge("m.gauge").set(1);
    const snapshot = registry.snapshot();
    expect(Object.keys(snapshot.counters)).toEqual(["a.metric", "z.metric"]);
    expect(Object.isFrozen(snapshot.counters)).toBe(true);
    expect(Object.isFrozen(snapshot.gauges)).toBe(true);
    expect(Object.isFrozen(snapshot.histograms)).toBe(true);
    expect(typeof snapshot.capturedAtUtc).toBe("string");
  });
});
