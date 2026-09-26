import { execFileSync } from "node:child_process";
import path from "node:path";
import { truncateLineWidth } from "./truncation.js";

/**
 * Searching file contents with ripgrep, when ripgrep is there.
 *
 * The in-process search this replaced read every file in the workspace one at a
 * time, waited for each read, and tested each line with a JavaScript regex. On
 * this repository that is 1.3 seconds for a pattern that occurs twice, against
 * 30 milliseconds for `rg` — and the gap is not the language. It is that
 * ripgrep already solved the parts that dominate: literal pre-filtering before
 * the regex, parallel directory traversal, memory-mapped reads, skipping binary
 * files, and the ignore rules. Every implementation we compared against reaches
 * it the same way, by running ripgrep: one ships the binary inside its own
 * executable, one downloads it on demand, one links its crates.
 *
 * So this does not reimplement any of that. It shells out, and when `rg` is not
 * installed the caller falls back to the in-process walk rather than failing —
 * the same degradation the compared implementations use for their native
 * dependencies.
 */

/**
 * Directories never searched, at any depth.
 *
 * The same set the in-process walk prunes. Passed explicitly because ripgrep
 * reads the repository's ignore files but does not know which directories this
 * project decided are never worth reading: a repository that does not ignore
 * `node_modules` still should not have it searched.
 */
const PRUNED_DIRECTORIES = ["node_modules", ".git", "dist", ".normproof"] as const;

/**
 * The largest file either search path will read.
 *
 * Exported so the grep tool's in-process walk uses the same number rather than a
 * second literal: the fast path passes it to ripgrep as a flag, and two copies
 * of it would let the paths drift into searching different files.
 */
export const MAX_SEARCHED_FILE_BYTES = 10 * 1024 * 1024;

/** One matching line, located. */
export interface RipgrepMatch {
  readonly path: string;
  readonly lineNumber: number;
  readonly line: string;
}

/** Why a ripgrep search did not produce an answer. */
export type RipgrepUnavailable =
  /** No `rg` on PATH. */
  | "not-installed"
  /** The requested search path resolves outside the workspace root. */
  | "outside-workspace"
  /** `rg` ran and failed in a way that is not "no matches". */
  | "failed";

export type RipgrepOutcome =
  | { readonly ok: true; readonly matches: readonly RipgrepMatch[] }
  | { readonly ok: false; readonly reason: RipgrepUnavailable; readonly detail?: string };

export interface RipgrepSearchInput {
  readonly pattern: string;
  /** Directory to search, relative to the workspace root. */
  readonly searchPath: string;
  readonly glob?: string;
  readonly ignoreCase?: boolean;
  readonly limit: number;
  /** Workspace root, used as the working directory so paths come back relative. */
  readonly workspaceRoot: string;
}

/**
 * Where `rg` is, or nothing.
 *
 * Resolved once and remembered: the answer cannot change within a session, and
 * asking on every call would put a process spawn in front of the search this
 * exists to make fast.
 */
let resolvedBinary: string | undefined | null = null;

export function resolveRipgrepBinary(): string | undefined {
  if (resolvedBinary !== null) return resolvedBinary;
  for (const candidate of ["rg", "ripgrep"]) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", windowsHide: true });
      resolvedBinary = candidate;
      return candidate;
    } catch {
      // Not this one. Trying the next is cheaper than reporting a failure the
      // caller would have to interpret.
    }
  }
  resolvedBinary = undefined;
  return undefined;
}

/** Reset the memoised lookup. For tests that change what is on PATH. */
export function forgetRipgrepBinary(): void {
  resolvedBinary = null;
}

/** The argv one search runs with. Exported so a test can pin the shape. */
export function ripgrepArgs(input: RipgrepSearchInput): readonly string[] {
  const args = ["--json", "--line-number", "--color=never", "--hidden"];
  if (input.ignoreCase) args.push("--ignore-case");
  for (const directory of PRUNED_DIRECTORIES) args.push("--glob", `!${directory}`);
  if (input.glob && input.glob.trim() !== "") {
    args.push("--glob", input.glob.trim());
    // The in-process walk compiles its glob with `nocase`, so `*.ts` finds
    // `File.TS` there. Without this flag ripgrep's glob is case-sensitive and the
    // same filter returns a different set — a divergence between two paths that
    // are supposed to answer the same question.
    args.push("--glob-case-insensitive");
  }
  // The in-process walk skips files larger than this, so the fast path must too:
  // a search that reports a hit inside a file the fallback would never read is a
  // divergence, and the size cap exists to keep a minified bundle or a data dump
  // from being read into memory.
  args.push("--max-filesize", `${MAX_SEARCHED_FILE_BYTES}`);
  // `--` so a pattern beginning with `-` is read as a pattern.
  args.push("--", input.pattern, input.searchPath === "" ? "." : input.searchPath);
  return args;
}
/** One ripgrep JSON record, as far as this needs to understand it. */
interface RipgrepRecord {
  readonly type?: unknown;
  readonly data?: {
    readonly path?: { readonly text?: unknown };
    readonly lines?: { readonly text?: unknown };
    readonly line_number?: unknown;
  };
}

/**
 * Read a ripgrep JSON stream into matches.
 *
 * `--json` rather than the plain `path:line:text` form because the plain form
 * cannot be split reliably: a filename may contain a colon, and ripgrep omits
 * the filename entirely when it searched a single file, so the reader would have
 * to guess which shape it was handed. The JSON records say which is which.
 */
export function parseRipgrepJson(output: string, limit: number): readonly RipgrepMatch[] {
  const matches: RipgrepMatch[] = [];
  for (const line of output.split("\n")) {
    if (line === "" || matches.length >= limit) continue;
    let record: RipgrepRecord;
    try {
      record = JSON.parse(line) as RipgrepRecord;
    } catch {
      // A truncated final line, or something ripgrep did not write. Skipping it
      // is right: one unreadable record is not a reason to lose the rest.
      continue;
    }
    if (record.type !== "match") continue;
    const path = record.data?.path?.text;
    const text = record.data?.lines?.text;
    const lineNumber = record.data?.line_number;
    if (typeof path !== "string" || typeof text !== "string" || typeof lineNumber !== "number") {
      continue;
    }
    matches.push({
      path,
      lineNumber,
      // The record carries the line with its terminator; the tool reports lines.
      line: text.replace(/\r?\n$/, ""),
    });
  }
  return matches;
}

/**
 * One match, in the shape the grep tool reports.
 *
 * Truncated through the same helper the in-process path uses, so a long line
 * reads the same whichever search answered.
 */
export function formatRipgrepMatch(match: RipgrepMatch, maxLineWidth: number): string {
  return `${match.path}:${match.lineNumber}: ${truncateLineWidth(match.line, maxLineWidth)}`;
}

/**
 * Run one ripgrep search.
 *
 * Never throws: a missing binary and a failed run are both answers the caller
 * acts on by falling back, and an exception would make the common case (no
 * ripgrep installed) look like a bug.
 */
export function searchWithRipgrep(input: RipgrepSearchInput): RipgrepOutcome {
  const binary = resolveRipgrepBinary();
  if (!binary) return { ok: false, reason: "not-installed" };

  // Containment is checked here rather than left to the caller. `path` is
  // model-supplied, and a search path like `foo/../../elsewhere` resolves outside
  // the workspace: the tool would then read files the session was never given
  // access to, and report them as if they were in the workspace. The in-process
  // walk refuses these by accident (it matches the path as a string prefix), so
  // without this check the fast path would be the less safe of the two — the
  // opposite of what a fallback should be.
  const root = path.resolve(input.workspaceRoot);
  const target = input.searchPath === "" ? root : path.resolve(root, input.searchPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return { ok: false, reason: "outside-workspace" };
  }

  try {
    const stdout = execFileSync(binary, [...ripgrepArgs(input)], {
      cwd: input.workspaceRoot,
      encoding: "utf8",
      windowsHide: true,
      // stderr is captured rather than inherited: a search path that does not
      // exist makes ripgrep print its own complaint, and forwarding that would
      // put ripgrep's wording into a session that never mentions ripgrep. The
      // failure is handled below, in the tool's own terms.
      stdio: ["ignore", "pipe", "pipe"],
      // A broad pattern over a large repository produces megabytes of JSON, and
      // the default buffer would fail on exactly the searches this exists to
      // make fast. The caller's limit still decides how much is kept.
      maxBuffer: 256 * 1024 * 1024,
    });
    return { ok: true, matches: parseRipgrepJson(stdout, input.limit) };
  } catch (error) {
    // Exit 1 means "ran correctly, found nothing" — an empty answer, not a
    // failure. Anything else (2, a spawn error, a buffer overflow) is a reason
    // to let the in-process walk answer instead.
    const failure = error as { status?: number | null; stdout?: string; message?: string };
    if (failure.status === 1) return { ok: true, matches: [] };
    if (typeof failure.stdout === "string" && failure.stdout !== "") {
      return { ok: true, matches: parseRipgrepJson(failure.stdout, input.limit) };
    }
    return {
      ok: false,
      reason: "failed",
      detail: failure.message ?? "ripgrep exited without a result",
    };
  }
}
