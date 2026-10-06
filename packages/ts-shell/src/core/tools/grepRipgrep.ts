import { StringDecoder } from "node:string_decoder";
import { ReadCleanupError, withVerifiedReadFiles } from '../../runtime/execution/read.js';
import { executeLocally } from "../../runtime/execution/local.js";
import path from "node:path";
import { realpathSync, statSync } from 'node:fs';
import { verifyPathContainment } from '../security/pathJail.js';
import { collectSearchFiles, permittedSearchFile, searchFileBatches } from './searchFiles.js';
import which from 'which';
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
  /** The execution owner could not verify input delivery or process cleanup. */
  | "execution-failure"
  /** A file descriptor used by native search could not be confirmed closed. */
  | "read-cleanup-failed"
  | "cancelled"
  | "timeout"
  | "output-limit";

export type RipgrepOutcome =
  | { readonly ok: true; readonly matches: readonly RipgrepMatch[] }
  | { readonly ok: false; readonly reason: RipgrepUnavailable; readonly detail?: string; readonly readCleanupFailed?: true };

export interface RipgrepSearchInput {
  readonly assertFileAccess?: (target: string) => void;
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
    if (input.abortSignal?.aborted) return { ok: false, reason: 'cancelled' };
    const result = await executeLocally({ command: candidate, args: ["--no-config", "--version"],
      cwd: input.workspaceRoot, timeoutMs: Math.min(input.timeoutMs ?? 2000, 2000),
      abortSignal: input.abortSignal, captureOutput: false });
    if (result.failureKind === 'execution_failure') return { ok: false, reason: 'execution-failure' };
    if (result.status === "cancelled" || result.status === "timeout") return { ok: false, reason: result.status };
    if (result.status === "completed") {
      resolvedBinary = candidate;
      return candidate;
    }
    if (result.spawnErrorCode !== 'ENOENT') return { ok: false, reason: 'failed' };
    // ENOENT can also mean an installed script has a missing interpreter.
    // Only the absence of the executable itself permits the fallback walk.
    try {
      if (which.sync(candidate, { nothrow: true })) return { ok: false, reason: 'failed' };
    } catch { return { ok: false, reason: 'failed' }; }
  }
  resolvedBinary = undefined;
  return { ok: false, reason: "not-installed" };
}

/** Reset the memoised lookup. For tests that change what is on PATH. */
export function forgetRipgrepBinary(): void {
  resolvedBinary = null;
}

/** The argv one search runs with. Exported so a test can pin the shape. */
function searchOptions(input: RipgrepSearchInput): string[] {
  const args = ["--no-config", "--color=never", "--hidden"];
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
  return args;
}

export function ripgrepArgs(input: RipgrepSearchInput, files?: readonly string[]): readonly string[] {
  const args = ["--json", "--line-number", ...searchOptions(input), "--max-count", `${Math.max(1, Math.ceil(input.limit))}`];
  // `--` so a pattern beginning with `-` is read as a pattern.
  args.push("--", input.pattern, ...(files ?? [input.searchPath === "" ? "." : input.searchPath]));
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
  const checked = verifyPathContainment(target, root);
  if (!checked.allowed) return { ok: false, reason: 'outside-workspace' };
  try {
    const stat = statSync(checked.resolvedPath);
    if (!stat.isFile() && !stat.isDirectory()) return { ok: false, reason: 'failed' };
    const canonicalRoot = realpathSync(root);
    input = { ...input, workspaceRoot: canonicalRoot, searchPath: path.relative(canonicalRoot, checked.resolvedPath) };
  } catch { return { ok: false, reason: 'failed' }; }
  const binary = await resolveRipgrepBinary(input);
  if (typeof binary !== "string") return binary;
  const currentTarget = path.resolve(input.workspaceRoot, input.searchPath);
  const current = verifyPathContainment(currentTarget, input.workspaceRoot);
  if (!current.allowed) return { ok: false, reason: 'outside-workspace' };
  if (current.resolvedPath !== currentTarget) return { ok: false, reason: 'failed' };
  if (!input.assertFileAccess) return streamSearch(binary, input);
  const deadline = Date.now() + (input.timeoutMs ?? 30_000);
  const listed = await collectSearchFiles({ binary,
    args: ['--files', '--null', ...searchOptions(input), '--', input.searchPath || '.'],
    workspaceRoot: input.workspaceRoot, assertFileAccess: input.assertFileAccess,
    abortSignal: input.abortSignal, timeoutMs: input.timeoutMs,
  });
  if (!listed.ok) return listed;
  const matches: RipgrepMatch[] = [];
  for (const batch of searchFileBatches(listed.files)) {
    if (input.abortSignal?.aborted) return { ok: false, reason: 'cancelled' };
    const allowed = batch.filter((file) => permittedSearchFile(input.workspaceRoot, file, input.assertFileAccess!) === file);
    if (!allowed.length) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, reason: 'timeout' };
    const result = await streamSearch(binary, { ...input, timeoutMs: remaining, limit: input.limit - matches.length }, allowed);
    if (!result.ok) return result;
    matches.push(...result.matches);
    if (matches.length >= input.limit) break;
  }
  return { ok: true, matches: matches.filter((match) => permittedSearchFile(input.workspaceRoot, match.path, input.assertFileAccess!) !== undefined) };
}

async function streamSearch(binary: string, input: RipgrepSearchInput, files?: readonly string[]): Promise<RipgrepOutcome> {
  if (files && process.platform === 'linux') {
    const deadline = Date.now() + (input.timeoutMs ?? 30_000);
    const observed: { outcome?: RipgrepOutcome } = {};
    try {
      return await withVerifiedReadFiles(files.map(file => ({
        operationKind: 'file.read', absolutePath: path.resolve(input.workspaceRoot, file), workspaceRoot: input.workspaceRoot,
        authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'Read approved native search candidates.' },
        caller: 'core-tool:grep', reason: 'Bind native search to verified file descriptors.', reportSafeTarget: file,
        assertFileAccess: input.assertFileAccess, abortSignal: input.abortSignal,
      })), async handles => {
        const remaining = deadline - Date.now();
        observed.outcome = remaining <= 0 ? { ok: false, reason: 'timeout' }
          : await streamOutput(binary, { ...input, timeoutMs: remaining }, files, handles.map(handle => handle.fd));
        return observed.outcome;
      });
    } catch (error) {
      if (error instanceof ReadCleanupError) {
        return observed.outcome?.ok === false && observed.outcome.reason === 'execution-failure'
          ? { ...observed.outcome, readCleanupFailed: true } : { ok: false, reason: 'read-cleanup-failed' };
      }
      return { ok: false, reason: input.abortSignal?.aborted ? 'cancelled' : 'failed' };
    }
  }
  return streamOutput(binary, input, files);
}

async function streamOutput(binary: string, input: RipgrepSearchInput, files?: readonly string[], readDescriptors?: readonly number[]): Promise<RipgrepOutcome> {
  const descriptorPaths = readDescriptors?.map((_, index) => `/proc/self/fd/${index + 3}`);
  const sourcePaths = new Map(descriptorPaths?.map((file, index) => [file, files![index]!]));
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
      for (const parsed of parseRipgrepJson(line, 1)) {
        const source = descriptorPaths ? sourcePaths.get(parsed.path) : parsed.path;
        if (source === undefined) continue;
        const match = { ...parsed, path: source };
        if (input.assertFileAccess) {
          const allowed = permittedSearchFile(input.workspaceRoot, match.path, input.assertFileAccess);
          if (allowed === undefined || !files?.includes(allowed)) continue;
        }
        matches.push({ ...match, line: truncateLineWidth(match.line, 500) });
      }
      if (matches.length >= input.limit) { limitReached = true; controller.abort(); break; }
    }
    if (pending.length > recordLimit) { oversized = true; controller.abort(); }
    if (controller.signal.aborted) pending = "";
  };
  try {
    const args = readDescriptors
      ? [...ripgrepArgs({ ...input, glob: undefined }, descriptorPaths)] : [...ripgrepArgs(input, files)];
    if (readDescriptors) args.unshift('--no-ignore', '--no-mmap');
    const result = await executeLocally({ command: binary, args, readDescriptors,
      cwd: input.workspaceRoot, abortSignal: controller.signal, timeoutMs: input.timeoutMs ?? 30_000,
      captureOutput: false, onStdout: consume });
    // Failed cleanup stays visible even when a match limit or cancellation
    // prompted the stop. Exit one alone only proves an ordinary empty search.
    if (result.failureKind === 'execution_failure') return { ok: false, reason: 'execution-failure' };
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
