import { scanCommandArgs } from "../../../core/commands/arguments.js";
import { completionToken, completionEdit, quoteCompletion } from "../completion.js";
import { getSlashInvocation } from "../../../entrypoints/slashCommandRegistry.js";
import type { DraftSnapshot } from "../../../presentation/tui/editor/replacement.js";
import { matchSuggestions, type Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type CatalogKind = "theme" | "skill" | "tools";

export function catalogRequest(snapshot: DraftSnapshot) {
  const token = completionToken(snapshot.text, snapshot.cursor);
  const command = token.before[0];
  if (!command || !/^\/[A-Za-z0-9:._?-]+$/.test(snapshot.text.slice(command.from, command.to))) return undefined;
  const name = getSlashInvocation(command.value)?.commandName;
  if (name !== "theme" && name !== "skill" && name !== "tools") return undefined;
  const preceding = token.before.slice(1);
  if (preceding.length && !(preceding.length === 1 && preceding[0]?.value === "--")) return undefined;
  if (!preceding.length && token.value.startsWith("-")) return undefined;
  const all = scanCommandArgs(snapshot.text, true).slice(1);
  if (all.length > (all[0]?.value === "--" ? 2 : 1)) return undefined;
  return { kind: name as CatalogKind, token, snapshot };
}

export function catalogSuggestions(request: NonNullable<ReturnType<typeof catalogRequest>>, items: readonly Suggestion[]) {
  return matchSuggestions(request.token.value, items).slice(0, 100).map(item =>
    completionEdit(item, request.snapshot, request.token.from, request.token.to, (item.value.startsWith("-") && request.token.before.length === 1 ? "-- " : "") + quoteCompletion(item.value, request.token.prefix)));
}
