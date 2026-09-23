import { createComponentLogger } from "./structuredLogger.js";

export interface MetricEvent {
  readonly name: string;
  readonly value: number;
  readonly unit: "count" | "ms";
  readonly tags: Record<string, string>;
}

/**
 * Counters and timings, written where the rest of the runtime's records go.
 *
 * A metric with nowhere to go is indistinguishable from one that was never
 * taken, so these land in the same rotating file as the structured logs and are
 * readable with the same command. That keeps one place to look instead of a
 * second store nobody remembers to check.
 *
 * **Values are buffered and written once per turn, not per call.** The log sink
 * appends synchronously, so recording a tool's duration as it happens would put
 * a blocking disk write on the hot path for every tool call — dozens per turn.
 * The accumulator keeps the write count at one per turn while preserving the
 * count and the tags, which is what a reader actually wants: not "a tool ran",
 * but "this tool ran eleven times and took 4.2s in total".
 *
 * **The buffer is process-wide rather than per session, which holds only because
 * one session runs at a time.** `ShellSessionRuntime` refuses a second prompt
 * while one is running, and every recording path sits inside a turn that flushes
 * on the way out, so nothing survives across sessions in practice. A change that
 * ran two sessions concurrently, or a turn that outlived its caller, would need
 * this keyed by session — otherwise the first flush would attribute the other
 * session's counts to itself.
 */
const logger = createComponentLogger("metric");

interface Accumulated {
  readonly name: string;
  count: number;
  total: number;
  max: number;
  readonly unit: MetricEvent["unit"];
  readonly tags: Record<string, string>;
}

let pending = new Map<string, Accumulated>();

/** The key a metric accumulates under: its name plus the tags that distinguish it. */
function accumulationKey(name: string, tags: Record<string, string>): string {
  const parts = Object.keys(tags)
    .sort()
    .map((key) => `${key}=${tags[key]}`);
  return [name, ...parts].join("|");
}

function accumulate(name: string, value: number, unit: MetricEvent["unit"], tags: Record<string, string>): void {
  const key = accumulationKey(name, tags);
  const existing = pending.get(key);
  if (existing) {
    existing.count += 1;
    existing.total += value;
    existing.max = Math.max(existing.max, value);
    return;
  }
  pending.set(key, { name, count: 1, total: value, max: value, unit, tags });
}

/**
 * Record that something happened.
 *
 * Buffered, so this is cheap enough to call on the hot path. Nothing reaches
 * disk until {@link flushMetrics} runs.
 */
export function recordCount(name: string, value: number, tags: Record<string, string> = {}): void {
  accumulate(name, value, "count", tags);
}

/** Record how long something took, in milliseconds. Buffered the same way. */
export function recordTiming(name: string, value: number, tags: Record<string, string> = {}): void {
  accumulate(name, value, "ms", tags);
}

/**
 * Write everything accumulated since the last flush, as one record per metric.
 *
 * One `logger.info` per metric rather than one per call: a turn that ran forty
 * tool calls produces a handful of lines, not forty.
 */
export function flushMetrics(): void {
  if (pending.size === 0) return;
  const batch = pending;
  // Swapped before writing: a metric recorded while these are being written
  // belongs to the next turn, not this one.
  pending = new Map();
  for (const entry of batch.values()) {
    logger.info(entry.name, {
      metric: entry.unit,
      count: entry.count,
      total: entry.total,
      max: entry.max,
      ...entry.tags,
    });
  }
}

/**
 * What has been accumulated and not yet written.
 *
 * For tests and for the rare caller that wants the numbers without writing them.
 */
export function pendingMetrics(): readonly MetricEvent[] {
  return [...pending.values()].map((entry) => ({
    name: entry.name,
    value: entry.total,
    unit: entry.unit,
    tags: entry.tags,
  }));
}

/** Drop everything accumulated. Only for tests that need a clean slate. */
export function resetMetrics(): void {
  pending = new Map();
}
