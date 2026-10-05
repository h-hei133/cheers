import { scanCommandArgs } from "../../core/commands/arguments.js";
import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";
import type { DraftSnapshot } from "../../presentation/tui/editor/replacement.js";

/** Locate the complete token but query only the part before the caret. */
export function completionToken(draft: string, cursor: number) {
  const tokens = scanCommandArgs(draft, true);
  const token = tokens.find(item => item.from <= cursor && cursor <= item.to);
  const from = token?.from ?? cursor;
  const to = token?.to ?? cursor;
  const prefix = draft.slice(from, cursor);
  const value = scanCommandArgs(prefix, true)[0]?.value ?? "";
  return { from, to, prefix, value, before: tokens.filter(item => item.to < from) };
}

export function completionEdit(candidate: Suggestion, snapshot: DraftSnapshot, from: number, to: number, text = candidate.value): Suggestion {
  // Keep existing separators byte-for-byte; only create one at the end.
  const insertion = text + (to === snapshot.text.length ? " " : "");
  return { ...candidate, edit: { snapshot, from, to, text: insertion } };
}

export function quoteCompletion(value: string, raw: string, sigil = ""): string {
  const body = raw.slice(sigil.length);
  const quote = body.startsWith("'") ? "'" : body.startsWith('"') || /[\s"'\\]/.test(value) ? '"' : "";
  if (quote === "'") return sigil + "'" + value.replace(/'/g, "'\\''") + "'";
  if (quote === '"') return sigil + '"' + value.replace(/["\\$`]/g, "\\$&") + '"';
  return sigil + value;
}
