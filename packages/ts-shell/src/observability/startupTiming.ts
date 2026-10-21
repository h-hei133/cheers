import { writeFileSync } from 'node:fs';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

/** Opt-in measurements from the runtime monotonic origin, excluding parent launchers. */
const ENABLED = process.env.CHEERS_TIMING === "1";
const TIMING_PATH = process.env.CHEERS_TIMING_PATH?.trim();
interface TimingRun {
  readonly marks: Array<{ readonly label: string; readonly ms: number; readonly elapsedMs: number }>;
  lastAt: number;
}
const runs = new Map<string, TimingRun>();
const eventLoop = ENABLED
  ? monitorEventLoopDelay({ resolution: 10 })
  : undefined;
eventLoop?.enable();

/** Gaps between observed events include intervening asynchronous work and waiting. */
export function time(label: string, namespace: string = "startup"): void {
  if (!ENABLED) return;
  const run = runs.get(namespace) ?? { marks: [], lastAt: 0 };
  const now = performance.now();
  run.marks.push({ label, ms: now - run.lastAt, elapsedMs: now });
  run.lastAt = now;
  runs.set(namespace, run);
}

/** Rendering owns when these events occur; disabled timing installs no observers. */
export function startupObservers(): {
  readonly onInputReady?: () => void;
  readonly onFirstLayout?: () => void;
  readonly onFirstWrite?: () => void;
} {
  if (!ENABLED) return {};
  return {
    onInputReady: () => time('input listener ready'),
    onFirstLayout: () => time('first frame layout'),
    onFirstWrite: () => time('first frame write completed'),
  };
}

export function formatTimingReport(namespace: string = "startup"): string {
  const marks = runs.get(namespace)?.marks ?? [];
  if (marks.length === 0) {
    return "No timing recorded. Set CHEERS_TIMING=1 before starting to measure startup.";
  }
  const lines = [
    "Startup phases (process monotonic clock):",
    ...marks.map(mark => `  ${mark.label}: ${mark.ms.toFixed(1)}ms (elapsed ${mark.elapsedMs.toFixed(1)}ms)`),
    `  total: ${marks.at(-1)!.elapsedMs.toFixed(1)}ms`,
    'Gaps are intervals between events, not exclusive work durations.',
    'Excludes parent launcher time. Write completion is the output stream callback, not visible terminal pixels.',
  ];
  const loop = eventLoopSnapshot();
  if (loop) lines.push(`Event loop delay: p50=${loop.p50Ms.toFixed(1)}ms p95=${loop.p95Ms.toFixed(1)}ms max=${loop.maxMs.toFixed(1)}ms`);
  return lines.join("\n");
}

export interface TimingSnapshot {
  readonly enabled: boolean;
  readonly marks: readonly { readonly label: string; readonly ms: number; readonly elapsedMs: number }[];
  readonly eventLoop?: {
    readonly count: number;
    readonly minMs: number;
    readonly meanMs: number;
    readonly p50Ms: number;
    readonly p95Ms: number;
    readonly p99Ms: number;
    readonly maxMs: number;
  };
}

/** Raw process-local evidence for the benchmark owner, never a user-facing metric. */
export function timingSnapshot(namespace: string = "startup"): TimingSnapshot {
  const loop = eventLoopSnapshot();
  return {
    enabled: ENABLED,
    marks: [...(runs.get(namespace)?.marks ?? [])],
    ...(loop ? { eventLoop: loop } : {}),
  };
}

function eventLoopSnapshot(): TimingSnapshot["eventLoop"] | undefined {
  if (!eventLoop || eventLoop.count === 0) return undefined;
  return {
    count: eventLoop.count,
    minMs: eventLoop.min / 1_000_000,
    meanMs: eventLoop.mean / 1_000_000,
    p50Ms: eventLoop.percentile(50) / 1_000_000,
    p95Ms: eventLoop.percentile(95) / 1_000_000,
    p99Ms: eventLoop.percentile(99) / 1_000_000,
    maxMs: eventLoop.max / 1_000_000,
  };
}

function writeTimingSnapshot(): void {
  if (!TIMING_PATH) return;
  try {
    writeFileSync(TIMING_PATH, JSON.stringify(timingSnapshot()), "utf8");
  } catch {
    // Measurement must never change the command's terminal result.
  }
}

if (ENABLED && TIMING_PATH) process.once("exit", writeTimingSnapshot);
