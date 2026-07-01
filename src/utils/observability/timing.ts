// Lightweight latency instrumentation for DB-touching operations.
//
// Wrap any async op with `time(label, () => ...)` to record its duration into
// an in-memory ring buffer (+ console.debug). Read aggregates with
// `getTimingStats()` for an on-device overlay, or the raw log with
// `getTimings()`. No network, no deps — safe to call anywhere.

export interface TimingEntry {
  label: string;
  ms: number;
  at: number;
}

const RING_MAX = 200;
const ring: TimingEntry[] = [];

function record(label: string, ms: number): void {
  ring.push({ label, ms, at: Date.now() });
  if (ring.length > RING_MAX) ring.shift();
  // eslint-disable-next-line no-console
  console.debug(`[timing] ${label}: ${ms.toFixed(0)}ms`);
}

export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(label, performance.now() - start);
  }
}

export function getTimings(): TimingEntry[] {
  return [...ring];
}

export interface TimingStat {
  label: string;
  count: number;
  p50: number;
  p95: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export function getTimingStats(): TimingStat[] {
  const byLabel = new Map<string, number[]>();
  for (const entry of ring) {
    const arr = byLabel.get(entry.label) ?? [];
    arr.push(entry.ms);
    byLabel.set(entry.label, arr);
  }
  return [...byLabel.entries()]
    .map(([label, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        label,
        count: sorted.length,
        p50: Math.round(percentile(sorted, 0.5)),
        p95: Math.round(percentile(sorted, 0.95)),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
      };
    })
    .sort((a, b) => b.p50 - a.p50);
}

export function clearTimings(): void {
  ring.length = 0;
}
