import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { createComponentLogger } from './structuredLogger.js';
import { bindTrace, currentTrace } from './tracing/context.js';
import { METRIC_TAGS, metricKey } from './metrics/model.js';
import { durationBucket, emptyHistogram } from './metrics/histogram.js';

export interface MetricEvent {
  readonly name: string;
  readonly value: number;
  readonly unit: 'count' | 'ms';
  readonly tags: Record<string, string>;
}

const logger = createComponentLogger('metric');
const SERIES_LIMIT = 128;
const RUN_LIMIT = 64;
const LABEL_BYTES = 256;
const DROPPED = 'metrics.dropped';

interface Accumulated {
  readonly name: string;
  count: number;
  total: number;
  max: number;
  readonly unit: MetricEvent['unit'];
  readonly tags: Record<string, string>;
  readonly buckets?: number[];
}

interface BufferOwner {
  pending: Map<string, Accumulated>;
  dropped: number;
  closed: boolean;
  readonly runId?: string;
  readonly write: (name: string, fields: Record<string, unknown>) => void;
}

function buffer(runId?: string): BufferOwner {
  return { pending: new Map(), dropped: 0, closed: false, runId,
    write: bindTrace((name: string, fields: Record<string, unknown>) => logger.info(name, fields)) };
}

const unscoped = buffer();
const runs = new WeakMap<object, BufferOwner | null>();
const active = new Set<BufferOwner>();

function currentBuffer(): BufferOwner | undefined {
  const trace = currentTrace();
  const captured = trace && runs.get(trace.scope);
  const owner = captured === undefined ? unscoped : captured;
  return owner?.closed ? undefined : owner ?? undefined;
}

/** One session run owns its metrics through tool calls, retries and settlement. */
export async function runMetrics<T>(callback: () => T | Promise<T>): Promise<T> {
  const trace = currentTrace();
  if (!trace || runs.has(trace.scope)) return callback();
  if (active.size >= RUN_LIMIT) {
    runs.set(trace.scope, null);
    unscoped.dropped++;
    return callback();
  }
  const runId = trace.spanId ?? randomBytes(8).toString('hex');
  const owner = buffer(runId);
  runs.set(trace.scope, owner);
  active.add(owner);
  try { return await callback(); }
  finally {
    owner.closed = true;
    active.delete(owner);
    flush(owner);
  }
}

function metricLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= LABEL_BYTES && Buffer.byteLength(value) <= LABEL_BYTES;
}

function accumulate(name: string, value: number, unit: MetricEvent['unit'], tags: Record<string, string>): void {
  const owner = currentBuffer();
  if (!owner) return;
  if (!metricLabel(name) || name === DROPPED || !Number.isFinite(value) || unit === 'ms' && value < 0
    || !tags || typeof tags !== 'object' || types.isProxy(tags)) {
    owner.dropped++;
    return;
  }
  const labels: Record<string, string> = {};
  for (const key of METRIC_TAGS) {
    if (key === 'sessionId' && owner.runId) continue;
    const field = Object.getOwnPropertyDescriptor(tags, key);
    if (field && !('value' in field)) { owner.dropped++; return; }
    const label: unknown = field?.value;
    if (label === undefined) continue;
    if (!metricLabel(label)) { owner.dropped++; return; }
    labels[key] = label;
  }
  const key = metricKey(name, unit, labels);
  let entry = owner.pending.get(key);
  if (!entry) {
    if (owner.pending.size >= SERIES_LIMIT) { owner.dropped++; return; }
    entry = { name, unit, tags: labels, count: 0, total: 0, max: value, ...(unit === 'ms' ? { buckets: emptyHistogram() } : {}) };
    owner.pending.set(key, entry);
  }
  const total = entry.total + value;
  if (!Number.isFinite(total) || entry.count === Number.MAX_SAFE_INTEGER) { owner.dropped++; return; }
  entry.count++;
  entry.total = total;
  entry.max = Math.max(entry.max, value);
  if (entry.buckets) {
    const index = durationBucket(value);
    entry.buckets[index] = entry.buckets[index]! + 1;
  }
}

export function recordCount(name: string, value: number, tags: Record<string, string> = {}): void {
  accumulate(name, value, 'count', tags);
}

export function recordTiming(name: string, value: number, tags: Record<string, string> = {}): void {
  accumulate(name, value, 'ms', tags);
}

function flush(owner: BufferOwner): void {
  if (!owner.pending.size && !owner.dropped) return;
  const { pending, dropped, runId } = owner;
  owner.pending = new Map();
  owner.dropped = 0;
  const identity = runId ? { runId } : {};
  for (const entry of pending.values()) {
    owner.write(entry.name, { ...entry.tags, ...identity, metric: entry.unit, count: entry.count, total: entry.total, max: entry.max,
      ...(entry.buckets ? { histogram: { version: 1, counts: entry.buckets } } : {}) });
  }
  if (dropped) owner.write(DROPPED, { ...identity, metric: 'count', count: 1, total: dropped, max: dropped });
}

/** Flush the current run's buffer, or the process buffer outside a run. */
export function flushMetrics(): void {
  const owner = currentBuffer();
  if (owner) flush(owner);
}

export function pendingMetrics(): readonly MetricEvent[] {
  const owner = currentBuffer();
  return owner ? [...owner.pending.values()].map(entry => ({
    name: entry.name, value: entry.total, unit: entry.unit, tags: { ...entry.tags },
  })) : [];
}

export function resetMetrics(): void {
  for (const owner of [unscoped, ...active]) {
    owner.pending.clear();
    owner.dropped = 0;
  }
}

process.once('exit', () => {
  for (const owner of [unscoped, ...active]) {
    owner.closed = true;
    try { flush(owner); } catch { /* Preserve the original process exit. */ }
  }
});
