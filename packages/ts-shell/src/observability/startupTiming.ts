/**
 * How long each phase of startup took.
 *
 * Startup is where a product feels slow and where the cause is hardest to see:
 * the work is spread across configuration, discovery and rendering, and the only
 * symptom is a prompt that takes a moment too long to appear. Measuring it needs
 * to be free when nobody asked, because the alternative is a timer on every path
 * that nobody can afford to leave in.
 *
 * So the gate is read once, and every call returns immediately when it is closed.
 * Not "records and does not print" — does nothing at all.
 */

/** When the module was loaded, which is the earliest point timing can observe. */
const PROCESS_START = Date.now();

/** Whether timing was asked for. Read once, so a call cannot disagree with itself. */
const ENABLED = process.env.CHEERS_TIMING === "1";

interface TimingRun {
  readonly marks: Array<{ readonly label: string; readonly ms: number }>;
  lastAt: number;
}

const runs = new Map<string, TimingRun>();

/**
 * Record that a phase just finished.
 *
 * A namespace that has never been used starts itself, so a caller cannot lose
 * its first measurement by forgetting to reset first. The number is the gap
 * since the previous mark, not since the start: the question being asked is
 * which phase was slow, and a running total makes the reader do that subtraction
 * themselves — which they will get wrong once the list is long enough to scroll.
 *
 * The first mark measures from module load rather than reporting zero. A phase
 * that reports `0ms` because there was nothing before it hides the one interval
 * nobody else can see — everything between the process starting and the first
 * line of the entrypoint running — which for an ESM CLI is where most of the
 * time actually goes.
 */
export function time(label: string, namespace: string = "startup"): void {
  if (!ENABLED) return;
  const run = runs.get(namespace) ?? { marks: [], lastAt: PROCESS_START };
  const now = Date.now();
  run.marks.push({ label, ms: now - run.lastAt });
  run.lastAt = now;
  runs.set(namespace, run);
}

/** The phases recorded so far, in order. Empty when timing is off. */
function timingMarks(namespace: string): readonly { readonly label: string; readonly ms: number }[] {
  return runs.get(namespace)?.marks ?? [];
}

/**
 * Render the report as one line per phase.
 *
 * Returned rather than printed so the caller decides where it goes, and so the
 * whole thing costs nothing when timing is off.
 */
export function formatTimingReport(namespace: string = "startup"): string {
  const marks = timingMarks(namespace);
  if (marks.length === 0) {
    return "No timing recorded. Set CHEERS_TIMING=1 before starting to measure startup.";
  }
  const total = marks.reduce((sum, mark) => sum + mark.ms, 0);
  return [
    "Startup phases:",
    ...marks.map((mark) => `  ${mark.label}: ${mark.ms}ms`),
    `  total: ${total}ms`,
  ].join("\n");
}
