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
 */
const logger = createComponentLogger("metric");

export function recordCount(name: string, value: number, tags: Record<string, string> = {}): void {
  logger.info(name, { metric: "count", value, ...tags });
}

export function recordTiming(name: string, value: number, tags: Record<string, string> = {}): void {
  logger.info(name, { metric: "ms", value, ...tags });
}
