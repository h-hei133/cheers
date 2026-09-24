import * as fs from "node:fs";
import * as path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getGlobalRotatingFileSink } from "../../observability/rotatingFileSink.js";

/**
 * `/metrics` — what the session has been doing, in numbers.
 *
 * The metrics themselves go to the same structured log as everything else, which
 * is the right place for them: one file to look in rather than a second store
 * nobody remembers to check. But the log reader renders only the timestamp,
 * level, component and message of each line, and a metric's values live in the
 * fields it carries. So the numbers are written but not visible, which makes this
 * command the other half of the feature rather than a convenience on top of it.
 *
 * Counts are summed and durations are averaged, because those are the two
 * questions someone actually asks: how often, and how slow.
 */

/** One metric line, as it was written. */
interface MetricLine {
  readonly name: string;
  readonly unit: "count" | "ms";
  readonly count: number;
  readonly total: number;
  readonly max: number;
  readonly tags: Record<string, string>;
}

interface Aggregated {
  readonly name: string;
  readonly unit: "count" | "ms";
  count: number;
  total: number;
  max: number;
  readonly tags: Record<string, string>;
}

const TAG_KEYS = ["tool", "outcome", "reason", "sessionId"] as const;

/**
 * How much of each log file is examined, from its end.
 *
 * A rotated part can hold 5 MB and the retention window is a week, so reading
 * every file whole made the command's memory use the size of the whole log store.
 * Metrics are the sparse lines among many ordinary ones, so the tail is where the
 * interesting ones are anyway.
 */
const TAIL_BYTES = 512 * 1024;

export async function runMetricsCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const limit = Number(args[0]) > 0 ? Number(args[0]) : 2000;
  const sink = getGlobalRotatingFileSink();
  const parsed = readMetricLines(sink.getLogDir(), sink.getCurrentFilePath(), limit);

  if (parsed.length === 0) {
    return {
      kind: "local",
      output: [
        "### Metrics",
        "",
        "No metrics recorded yet. Counters and timings are written at the end of each turn.",
      ].join("\n"),
    };
  }

  const aggregated = aggregate(parsed);
  const rows = aggregated.map((entry) => {
    const tags = TAG_KEYS.map((key) => (entry.tags[key] ? `${key}=${entry.tags[key]}` : ""))
      .filter(Boolean)
      .join(" ");
    const measure =
      entry.unit === "ms"
        ? // Averaged over calls, not over lines: a flush writes one line per
          // metric, and a session produces many flushes, so dividing by lines
          // would report the average per flush instead of per call.
          `avg ${Math.round(entry.total / Math.max(1, entry.count))}ms · max ${entry.max}ms`
        : `total ${entry.total}`;
    return `| \`${entry.name}\` | ${tags || "—"} | ${entry.count} | ${measure} |`;
  });

  return {
    kind: "local",
    output: [
      "### Metrics",
      "",
      "| Metric | Tags | Count | Measure |",
      "| :--- | :--- | ---: | :--- |",
      ...rows,
      "",
      `Read from the structured log. \`/log tail\` shows the same lines without these values, ` +
        `because it renders only the four fields it knows about.`,
    ].join("\n"),
  };
}

/**
 * Metric lines from every log file in the directory, oldest first.
 *
 * The sink writes one file per process — `<prefix>.<date>.<pid>.log` — so reading
 * only the current file would show nothing on the run after the one that did the
 * work. That is exactly backwards for a metrics view: the numbers are interesting
 * precisely because the session that produced them has ended. `/log tail` keeps
 * its per-process scope, which suits a tail of the live run.
 *
 * Three things this reader has to get right, each of which it got wrong:
 *
 * - **Rotated parts count.** The sink renames a full file to `.log.<n>`, so a
 *   filter on `.log` alone silently dropped everything written after a rotation.
 * - **The limit applies to metrics, not to lines.** Slicing the raw lines first
 *   meant a thousand ordinary log lines could push every metric out of the window
 *   and make the command report that nothing had been recorded.
 * - **Each file is read from its end.** Metrics are sparse among ordinary lines,
 *   and a week of 5 MB parts is a lot of text to hold for a few dozen numbers.
 */
function readMetricLines(logDir: string, currentPath: string, limit: number): MetricLine[] {
  let names: string[];
  try {
    names = fs.readdirSync(logDir);
  } catch {
    // No directory yet means nothing has been logged, which is the empty case.
    return [];
  }
  const files = names
    // `.log` and its rotated parts `.log.1`, `.log.2`, ...
    .filter((name) => /\.log(\.\d+)?$/.test(name))
    .map((name) => path.join(logDir, name))
    // Oldest first, so the slice below keeps the most recent lines. The
    // comparison falls through to the name so it is a total order: two files
    // written in the same millisecond would otherwise compare equal and leave
    // their relative order to the directory listing.
    .sort((left, right) => {
      const leftTime = safeMtime(left);
      const rightTime = safeMtime(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
      // Same timestamp: the current process's file is the newest by definition.
      const leftCurrent = left === currentPath ? 1 : 0;
      const rightCurrent = right === currentPath ? 1 : 0;
      if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
      return left.localeCompare(right);
    });

  const metrics: MetricLine[] = [];
  for (const file of files) {
    for (const line of tailLines(file, TAIL_BYTES)) {
      const metric = parseMetricLine(line);
      if (metric) metrics.push(metric);
    }
  }
  return metrics.slice(-limit);
}

/**
 * The last `maxBytes` of a file, as whole lines.
 *
 * The first line of a tail read is dropped: it is almost certainly a fragment of a
 * line whose beginning is before the cut, and a partial JSON object would either
 * fail to parse or, worse, parse into something wrong.
 */
function tailLines(file: string, maxBytes: number): string[] {
  let handle: number | undefined;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    if (length <= 0) return [];
    handle = fs.openSync(file, "r");
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, start);
    const text = buffer.toString("utf8");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    return start > 0 ? lines.slice(1) : lines;
  } catch {
    // A file that cannot be read is skipped rather than failing the command.
    return [];
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function safeMtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Read one structured log line as a metric, or nothing when it is not one. */
function parseMetricLine(line: string): MetricLine | undefined {
  let parsed: {
    component?: string;
    message?: string;
    fields?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch {
    return undefined;
  }
  // The component is what distinguishes a metric from an ordinary log line: the
  // metric logger names itself, so nothing else has to be checked.
  if (parsed.component !== "metric" || !parsed.message) return undefined;
  const fields = parsed.fields ?? {};
  const unit = fields.metric === "ms" ? "ms" : "count";
  const tags: Record<string, string> = {};
  for (const key of TAG_KEYS) {
    const value = fields[key];
    if (typeof value === "string") tags[key] = value;
  }
  // `value` is what the writer used before this command existed, and those lines
  // are on disk from earlier runs. Read as an unknown field they defaulted to a
  // total of zero, so a session's prompts were reported as `count 9, total 0` —
  // a number that looks measured and is not.
  const legacyValue = numberOr(fields.value, Number.NaN);
  return {
    name: parsed.message,
    unit,
    count: numberOr(fields.count, 1),
    total: Number.isNaN(legacyValue) ? numberOr(fields.total, 0) : legacyValue,
    max: numberOr(fields.max, Number.isNaN(legacyValue) ? 0 : legacyValue),
    tags,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Sum the lines that share a name and tags, so a long session is a few rows. */
function aggregate(lines: readonly MetricLine[]): Aggregated[] {
  const byKey = new Map<string, Aggregated>();
  for (const line of lines) {
    const key = [line.name, ...TAG_KEYS.map((tag) => line.tags[tag] ?? "")].join("|");
    const existing = byKey.get(key);
    if (existing) {
      existing.count += line.count;
      existing.total += line.total;
      existing.max = Math.max(existing.max, line.max);
      continue;
    }
    byKey.set(key, {
      name: line.name,
      unit: line.unit,
      count: line.count,
      total: line.total,
      max: line.max,
      tags: line.tags,
    });
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}
