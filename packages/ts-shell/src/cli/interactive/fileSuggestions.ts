import { completionEdit, quoteCompletion } from "./completion.js";
import { promptTokenAt } from '../../core/prompts/tokens.js';
import { scanCommandArgs } from '../../core/commands/arguments.js';
import type { DraftSnapshot } from "../../presentation/tui/editor/replacement.js";
import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";

/**
 * The file reference being typed, or nothing when the caret is not in one.
 *
 * `@` only opens a reference at the start of the draft or after whitespace. Any
 * word-adjacent `@` belongs to ordinary text such as an email address. Once a
 * reference opens, further sigils belong to its filename; a raw doubled sigil
 * and code spans remain literal.
 * The same reasoning as the command draft rule, applied to the other sigil.
 */
export function fileReferenceAt(draft: string, cursor = draft.length): { readonly query: string; readonly start: number } | null {
  const token = fileReferenceToken(draft, cursor);
  return token ? { query: token.value.slice(1), start: token.from } : null;
}

/** Prose owns the range; decode only an actual quote or escape in this reference. */
export function fileReferenceToken(draft: string, cursor = draft.length) {
  const source = promptTokenAt(draft, cursor);
  if (!source || source.literal === 'code') return null;
  const prefix = draft.slice(source.from, cursor);
  if (!prefix.startsWith('@') || prefix.startsWith('@@')) return null;
  const value = source.literal ? scanCommandArgs(prefix, true)[0]?.value ?? '' : prefix;
  return { from: source.from, to: source.to, prefix, value, before: [] as const };
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
export function fileSuggestions(draft: string, files: readonly string[], snapshot: DraftSnapshot = { text: draft, cursor: draft.length, revision: 0 }): Suggestion[] | null {
  const token = fileReferenceToken(draft, snapshot.cursor);
  if (!token) return null;
  const ranked = rankFiles(token.value.slice(1), files);
  if (ranked.length === 0) return null;
  // Accepting replaces the reference, not the sentence it sits in.
  return ranked.map(suggestion => completionEdit(suggestion, snapshot, token.from, token.to,
    quoteCompletion(suggestion.value.slice(1), suggestion.value.startsWith('@@') ? '@"' : token.prefix, "@")));
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
