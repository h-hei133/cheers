import { completionToken, completionEdit, quoteCompletion } from "./completion.js";
import type { DraftSnapshot } from "../../presentation/tui/editor/replacement.js";
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
  readonly files: readonly string[];
}

/**
 * One listing per workspace, kept until something says the tree changed.
 *
 * A single slot was wrong: a second workspace overwrote the first, and the
 * workspace that had just been asked about fell back to an empty list until its
 * walk finished again. Subagent and worktree sessions reach the same process, so
 * two roots is ordinary rather than exotic.
 */
const caches = new Map<string, CacheEntry>();
/**
 * Bumped when every listing is thrown away.
 *
 * A walk started before an invalidation must not install its result afterwards —
 * that would resurrect the very listing the reload was meant to discard — so each
 * walk records the generation it began in and only writes if it is still current.
 */
let generation = 0;

/**
 * The files of `root`, from the cache when it is current.
 *
 * Synchronous callers only: completion runs inside a keystroke handler and cannot
 * await a walk. The walk is kicked off once per workspace and the empty result
 * until it lands is correct rather than wrong — the list appears on the next
 * keystroke, and a stale list is what would mislead.
 */
export function workspaceFiles(root: string): readonly string[] {
  const cached = caches.get(root);
  if (cached !== undefined) return cached.files;
  // An empty entry marks a walk in flight, so a second keystroke does not start
  // another one.
  caches.set(root, { files: [] });
  const startedIn = generation;
  void listWorkspaceFiles(root)
    .then((files) => {
      // A listing that started before an invalidation describes a tree nobody is
      // asking about any more, so it is dropped rather than installed.
      if (generation === startedIn) {
        caches.set(root, { files: files.slice(0, MAX_CANDIDATES) });
      }
    })
    .catch(() => {
      // A walk that fails leaves the empty list in place, which completes
      // nothing rather than completing something wrong.
    });
  return caches.get(root)!.files;
}

/** Forget every cached listing, so the next completion walks again. */
export function invalidateWorkspaceFiles(): void {
  caches.clear();
  generation += 1;
}

/** Wait for the listing, for callers that can afford to. */
export async function warmWorkspaceFiles(root: string): Promise<void> {
  const cached = caches.get(root);
  // A populated entry needs no walk; an empty one may be a walk in flight, and
  // waiting on it is still what this caller asked for.
  if (cached !== undefined && cached.files.length > 0) return;
  const startedIn = generation;
  try {
    const files = await listWorkspaceFiles(root);
    if (generation === startedIn) {
      caches.set(root, { files: files.slice(0, MAX_CANDIDATES) });
    }
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
export function fileReferenceAt(draft: string, cursor = draft.length): { readonly query: string; readonly start: number } | null {
  const token = completionToken(draft, cursor);
  if (!token.prefix.startsWith("@") || token.value.slice(1).includes("@")) return null;
  return { query: token.value.slice(1), start: token.from };
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
export function fileSuggestions(draft: string, root: string, snapshot: DraftSnapshot = { text: draft, cursor: draft.length, revision: 0 }): Suggestion[] | null {
  const reference = fileReferenceAt(draft, snapshot.cursor);
  if (!reference) return null;
  const ranked = rankFiles(reference.query, workspaceFiles(root));
  if (ranked.length === 0) return null;
  // Accepting replaces the reference, not the sentence it sits in.
  const token = completionToken(draft, snapshot.cursor);
  return ranked.map(suggestion => completionEdit(suggestion, snapshot, token.from, token.to,
    quoteCompletion(suggestion.value.slice(1), token.prefix, "@")));
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
