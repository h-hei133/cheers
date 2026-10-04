import { StringDecoder } from "node:string_decoder";
import { executeLocally } from "../../runtime/execution/local.js";
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
  | "failed"
  | "cancelled"
  | "timeout"
  | "output-limit";

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
  readonly abortSignal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Where `rg` is, or nothing.
 *
 * Resolved once and remembered: the answer cannot change within a session, and
 * asking on every call would put a process spawn in front of the search this
 * exists to make fast.
 */
let resolvedBinary: string | undefined | null = null;

async function resolveRipgrepBinary(input: RipgrepSearchInput): Promise<string | Exclude<RipgrepOutcome, { ok: true }>> {
  if (resolvedBinary !== null) return resolvedBinary ?? { ok: false, reason: "not-installed" };
  for (const candidate of ["rg", "ripgrep"]) {
    const result = await executeLocally({ command: candidate, args: ["--version"],
      cwd: input.workspaceRoot, timeoutMs: Math.min(input.timeoutMs ?? 2000, 2000),
      abortSignal: input.abortSignal, captureOutput: false });
    if (result.status === "cancelled" || result.status === "timeout") return { ok: false, reason: result.status };
    if (result.status === "completed") {
      resolvedBinary = candidate;
      return candidate;
    }
  }
  resolvedBinary = undefined;
  return { ok: false, reason: "not-installed" };
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
  args.push("--max-filesize", `${MAX_SEARCHED_FILE_BYTES}`, "--max-count", `${Math.max(1, Math.ceil(input.limit))}`);
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
    if (!record || typeof record !== "object" || record.type !== "match") continue;
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
 * A missing binary permits the existing file-walk fallback. A failed or stopped
 * native search is reported as such, even if some matches arrived before it.
 */
export async function searchWithRipgrep(input: RipgrepSearchInput): Promise<RipgrepOutcome> {
  if (input.abortSignal?.aborted) return { ok: false, reason: "cancelled" };
  const root = path.resolve(input.workspaceRoot);
  const target = input.searchPath === "" ? root : path.resolve(root, input.searchPath);
  if (target !== root && !target.startsWith(root + path.sep)) return { ok: false, reason: "outside-workspace" };
  const binary = await resolveRipgrepBinary(input);
  if (typeof binary !== "string") return binary;
  return streamSearch(binary, input);
}

async function streamSearch(binary: string, input: RipgrepSearchInput): Promise<RipgrepOutcome> {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  input.abortSignal?.addEventListener("abort", onAbort, { once: true });
  if (input.abortSignal?.aborted) controller.abort();
  const decoder = new StringDecoder("utf8");
  const matches: RipgrepMatch[] = [];
  let pending = "";
  let limitReached = false;
  let oversized = false;
  // A JSON record can expand escaped characters, but never buffer an unbounded line.
  const recordLimit = MAX_SEARCHED_FILE_BYTES * 6 + 64 * 1024;
  const consume = (chunk: Buffer): void => {
    if (controller.signal.aborted) return;
    pending += decoder.write(chunk);
    let end: number;
    while ((end = pending.indexOf("\n")) >= 0) {
      if (end > recordLimit) { oversized = true; controller.abort(); break; }
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      // Retain only display-width text, not every full matching source line.
      for (const match of parseRipgrepJson(line, 1)) {
        matches.push({ ...match, line: truncateLineWidth(match.line, 500) });
      }
      if (matches.length >= input.limit) { limitReached = true; controller.abort(); break; }
    }
    if (pending.length > recordLimit) { oversized = true; controller.abort(); }
    if (controller.signal.aborted) pending = "";
  };
  try {
    const result = await executeLocally({ command: binary, args: [...ripgrepArgs(input)],
      cwd: input.workspaceRoot, abortSignal: controller.signal, timeoutMs: input.timeoutMs ?? 30_000,
      captureOutput: false, onStdout: consume });
    if (input.abortSignal?.aborted) return { ok: false, reason: "cancelled" };
    if (oversized) return { ok: false, reason: "output-limit" };
    if (result.status === "timeout") return { ok: false, reason: "timeout" };
    // Limit termination is only successful after the execution owner confirms cancellation.
    if (limitReached && result.status === "cancelled") return { ok: true, matches };
    if (result.status === "completed" || (result.status === "failed" && result.exitCode === 1)) {
      if (pending.trim()) return { ok: false, reason: "failed" };
      return { ok: true, matches };
    }
    return { ok: false, reason: "failed" };
  } finally {
    input.abortSignal?.removeEventListener("abort", onAbort);
  }
}
