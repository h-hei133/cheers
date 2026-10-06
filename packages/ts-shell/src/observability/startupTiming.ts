import { performance } from 'node:perf_hooks';

/** Opt-in measurements from the runtime monotonic origin, excluding parent launchers. */
const ENABLED = process.env.CHEERS_TIMING === "1";
interface TimingRun {
  readonly marks: Array<{ readonly label: string; readonly ms: number; readonly elapsedMs: number }>;
  lastAt: number;
}
const runs = new Map<string, TimingRun>();

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
  return [
    "Startup phases (process monotonic clock):",
    ...marks.map(mark => `  ${mark.label}: ${mark.ms.toFixed(1)}ms (elapsed ${mark.elapsedMs.toFixed(1)}ms)`),
    `  total: ${marks.at(-1)!.elapsedMs.toFixed(1)}ms`,
    'Gaps are intervals between events, not exclusive work durations.',
    'Excludes parent launcher time. Write completion is the output stream callback, not visible terminal pixels.',
  ].join("\n");
}
