export type MetricsLabels = Readonly<Record<string, string>>;

export interface CounterSeries {
  inc(delta?: number): void;
}

export interface GaugeSeries {
  set(value: number): void;
}

export interface HistogramSeries {
  observe(value: number): void;
}

export interface HistogramSummary {
  readonly count: number;
  readonly sum: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export interface MetricsSnapshot {
  readonly capturedAtUtc: string;
  readonly counters: Readonly<Record<string, number>>;
  readonly gauges: Readonly<Record<string, number>>;
  readonly histograms: Readonly<Record<string, HistogramSummary>>;
}

export interface MetricsRegistry {
  counter(name: string, labels?: MetricsLabels): CounterSeries;
  gauge(name: string, labels?: MetricsLabels): GaugeSeries;
  histogram(name: string, labels?: MetricsLabels): HistogramSeries;
  snapshot(): MetricsSnapshot;
}

const NAME_PATTERN = /^[a-z][a-z0-9_.]*$/;
const VALUE_DISALLOWED = /[^a-zA-Z0-9_./:{}-]/g;
const RESERVOIR_SIZE = 4_096;
const MAX_SERIES_PER_NAME = 512;

function sanitizeName(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid metric name: ${name}`);
  }
  return name;
}

function sanitizeValue(value: string): string {
  return value.replace(VALUE_DISALLOWED, "_").slice(0, 128);
}

function seriesKey(labels: MetricsLabels | undefined): string {
  if (!labels) return "";
  const entries = Object.entries(labels)
    .map(([key, value]) => `${key}="${sanitizeValue(value)}"`)
    .sort();
  return entries.length === 0 ? "" : `{${entries.join(",")}}`;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] ?? 0;
}

function summarize(samples: readonly number[]): HistogramSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  let sum = 0;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    sum += sample;
    if (sample > max) max = sample;
  }
  return {
    count: samples.length,
    sum,
    max: samples.length === 0 ? 0 : max,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

interface HistogramState {
  readonly samples: number[];
  head: number;
  cumulativeCount: number;
  cumulativeSum: number;
  max: number;
}

export function createMetricsRegistry(): MetricsRegistry {
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, HistogramState>();
  const seriesCounters = new Map<string, number>();
  const droppedSeries = new Map<string, number>();

  const registerSeries = (name: string): boolean => {
    const current = seriesCounters.get(name) ?? 0;
    if (current >= MAX_SERIES_PER_NAME) {
      droppedSeries.set(name, (droppedSeries.get(name) ?? 0) + 1);
      return false;
    }
    seriesCounters.set(name, current + 1);
    return true;
  };

  const registry: MetricsRegistry = {
    counter(name, labels) {
      const metricName = sanitizeName(name);
      const key = `${metricName}${seriesKey(labels)}`;
      const series: CounterSeries = {
        inc(delta?: number) {
          const amount = delta ?? 1;
          if (!Number.isFinite(amount) || amount < 0) return;
          counters.set(key, (counters.get(key) ?? 0) + amount);
        },
      };
      if (!counters.has(key) && !registerSeries(metricName)) {
        return NOOP_COUNTER;
      }
      return series;
    },
    gauge(name, labels) {
      const metricName = sanitizeName(name);
      const key = `${metricName}${seriesKey(labels)}`;
      const series: GaugeSeries = {
        set(value: number) {
          if (!Number.isFinite(value)) return;
          gauges.set(key, value);
        },
      };
      if (!gauges.has(key) && !registerSeries(metricName)) {
        return NOOP_GAUGE;
      }
      return series;
    },
    histogram(name, labels) {
      const metricName = sanitizeName(name);
      const key = `${metricName}${seriesKey(labels)}`;
      let state = histograms.get(key);
      if (!state) {
        if (!registerSeries(metricName)) {
          return NOOP_HISTOGRAM;
        }
        state = {
          samples: new Array<number>(RESERVOIR_SIZE).fill(0),
          head: 0,
          cumulativeCount: 0,
          cumulativeSum: 0,
          max: 0,
        } satisfies HistogramState;
        histograms.set(key, state);
      }
      const bound = state;
      const series: HistogramSeries = {
        observe(value: number) {
          if (!Number.isFinite(value) || value < 0) return;
          bound.samples[bound.head] = value;
          bound.head = (bound.head + 1) % RESERVOIR_SIZE;
          bound.cumulativeCount += 1;
          bound.cumulativeSum += value;
          if (value > bound.max) bound.max = value;
        },
      };
      return series;
    },
    snapshot() {
      const counterSnapshot: Record<string, number> = {};
      for (const key of [...counters.keys()].sort()) {
        counterSnapshot[key] = counters.get(key) ?? 0;
      }
      const gaugeSnapshot: Record<string, number> = {};
      for (const key of [...gauges.keys()].sort()) {
        gaugeSnapshot[key] = gauges.get(key) ?? 0;
      }
      const histogramSnapshot: Record<string, HistogramSummary> = {};
      for (const key of [...histograms.keys()].sort()) {
        const state = histograms.get(key);
        if (!state) continue;
        const filled =
          state.cumulativeCount < RESERVOIR_SIZE
            ? state.samples.slice(
                0,
                Math.min(state.head, state.cumulativeCount),
              )
            : state.samples;
        const summary = summarize(filled);
        histogramSnapshot[key] = {
          count: state.cumulativeCount,
          sum: state.cumulativeSum,
          max: state.max,
          p50: summary.p50,
          p95: summary.p95,
          p99: summary.p99,
        };
      }
      for (const [name, dropped] of [...droppedSeries.entries()].sort()) {
        counterSnapshot[`metrics.dropped_series{metric="${name}"}`] = dropped;
      }
      return {
        capturedAtUtc: new Date().toISOString(),
        counters: Object.freeze(counterSnapshot),
        gauges: Object.freeze(gaugeSnapshot),
        histograms: Object.freeze(histogramSnapshot),
      };
    },
  };

  return registry;
}

const NOOP_COUNTER: CounterSeries = { inc: () => undefined };
const NOOP_GAUGE: GaugeSeries = { set: () => undefined };
const NOOP_HISTOGRAM: HistogramSeries = { observe: () => undefined };
