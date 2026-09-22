import { listWorkspaceFiles } from "../../runtime/execution/fileWalk.js";
import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";

/**
 * File references written as `@path`.
 *
 * The candidate source is the workspace's files, ranked by the same tiered
 * matcher the command list uses — the ranking was never the gap. The gap was
 * that only a leading slash produced candidates at all, so a file could not be
 * referred to by name without typing the whole path.
 *
 * Listing is cached per workspace rather than per keystroke. A walk of a real
 * repository is milliseconds of work at best and a git subprocess at worst, and
 * completion runs on every character: recomputing per key would spend the
 * session's time answering the same question. The cache is dropped when the
 * workspace changes or when something says the tree did, which is what `/reload`
 * is for.
 */

/** How many candidates the list may hold, so a large repository stays usable. */
const MAX_CANDIDATES = 5000;

interface CacheEntry {
  readonly root: string;
  readonly files: readonly string[];
}

let cache: CacheEntry | undefined;

/**
 * The files of `root`, from the cache when it is current.
 *
 * Synchronous callers only: completion runs inside a keystroke handler and cannot
 * await a walk. The walk is kicked off once per workspace and the empty result
 * until it lands is correct rather than wrong — the list appears on the next
 * keystroke, and a stale list is what would mislead.
 */
export function workspaceFiles(root: string): readonly string[] {
  if (cache?.root === root) return cache.files;
  cache = { root, files: [] };
  void listWorkspaceFiles(root)
    .then((files) => {
      // Only if the workspace is still the one that was asked about: a session
      // that moved while the walk ran must not have the old tree cached under it.
      if (cache?.root === root) {
        cache = { root, files: files.slice(0, MAX_CANDIDATES) };
      }
    })
    .catch(() => {
      // A walk that fails leaves the empty list in place, which completes
      // nothing rather than completing something wrong.
    });
  return cache.files;
}

/** Forget the cached listing, so the next completion walks again. */
export function invalidateWorkspaceFiles(): void {
  cache = undefined;
}

/** Wait for the listing, for callers that can afford to. */
export async function warmWorkspaceFiles(root: string): Promise<void> {
  if (cache?.root === root && cache.files.length > 0) return;
  try {
    const files = await listWorkspaceFiles(root);
    cache = { root, files: files.slice(0, MAX_CANDIDATES) };
  } catch {
    // Leaving the previous answer in place is better than clearing it: a failed
    // refresh should not take away completions that already worked.
  }
}

/**
 * The file reference being typed, or nothing when the caret is not in one.
 *
 * `@` only opens a reference at the start of the draft or after whitespace. Any
 * other `@` is part of a word — an email address, a decorator, a URL with
 * credentials — and offering a file list there would be noise over ordinary text.
 * The same reasoning as the command draft rule, applied to the other sigil.
 */
export function fileReferenceAt(draft: string): { readonly query: string; readonly start: number } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(draft);
  if (!match) return null;
  const start = match.index + match[1]!.length;
  return { query: match[2]!, start };
}

/**
 * Whether the draft could still become a file reference, so an edit to it may
 * reopen a list a typo closed.
 *
 * A backspace carries no text of its own, so it is not a gesture that may open
 * anything. Without this the list never comes back after a mistyped path is
 * corrected, which is the same gap the command draft rule exists to close.
 */
export function couldBeFileReference(draft: string): boolean {
  return fileReferenceAt(draft) !== null;
}

/** Candidates for the file reference in `draft`, or nothing when there is none. */
export function fileSuggestions(draft: string, root: string): Suggestion[] | null {
  const reference = fileReferenceAt(draft);
  if (!reference) return null;
  const ranked = rankFiles(reference.query, workspaceFiles(root));
  if (ranked.length === 0) return null;
  // Accepting replaces the reference, not the sentence it sits in.
  return ranked.map((suggestion) => ({ ...suggestion, from: reference.start }));
}

/**
 * Files matching `query`, best first.
 *
 * Ranked here rather than through the shared matcher because the query is a path
 * and matching a path as a whole string ranks it wrongly: typing `src/co` should
 * find `src/core/x.ts` by its last segment, and a whole-string prefix match never
 * would. A path that ends with the query as a segment is the strongest match,
 * then a path whose final segment starts with it, then anywhere in the path.
 */
export function rankFiles(query: string, files: readonly string[]): Suggestion[] {
  const needle = query.toLowerCase();
  if (needle === "") {
    // Nothing typed yet: the shallowest files are the most likely target, and
    // the list has to stay short enough to read.
    return files.slice(0, 50).map(toSuggestion);
  }

  const scored: { file: string; rank: number }[] = [];
  for (const file of files) {
    const rank = fileRank(needle, file.toLowerCase());
    if (rank > 0) scored.push({ file, rank });
  }
  scored.sort((left, right) => right.rank - left.rank || left.file.length - right.file.length);
  return scored.slice(0, 50).map((entry) => toSuggestion(entry.file));
}

function fileRank(needle: string, file: string): number {
  const segments = file.split("/");
  const last = segments[segments.length - 1]!;
  if (last === needle) return 1000;
  if (last.startsWith(needle)) return 900;
  if (segments.some((segment) => segment === needle)) return 800;
  if (file.startsWith(needle)) return 700;
  if (file.includes(`/${needle}`)) return 600;
  if (last.includes(needle)) return 500;
  if (file.includes(needle)) return 400;
  return 0;
}

function toSuggestion(file: string): Suggestion {
  const cut = file.lastIndexOf("/");
  return {
    value: `@${file}`,
    label: cut === -1 ? file : file.slice(cut + 1),
    detail: cut === -1 ? undefined : file.slice(0, cut),
  };
}
