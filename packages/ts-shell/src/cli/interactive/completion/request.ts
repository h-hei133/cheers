import { resumeSyntax, forkSyntax, treeSyntax, entriesSyntax } from "../../../core/commands/navigation/syntax.js";
import { scanCommandArgs } from "../../../core/commands/arguments.js";
import { completionToken, completionEdit, quoteCompletion } from "../completion.js";
import { getSlashInvocation } from "../../../entrypoints/slashCommandRegistry.js";
import type { DraftSnapshot } from "../../../presentation/tui/editor/replacement.js";
import { matchSuggestions, type Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type CatalogKind = "theme" | "skill" | "tools" | "session" | "entry" | "tree" | "thread";

export function catalogRequest(snapshot: DraftSnapshot) {
  const token = completionToken(snapshot.text, snapshot.cursor);
  const command = token.before[0];
  if (!command || !/^\/[A-Za-z0-9:._?-]+$/.test(snapshot.text.slice(command.from, command.to))) return undefined;
  const invocation = getSlashInvocation(command.value);
  const name = invocation?.commandName;
  const preceding = token.before.slice(1).map(item => item.value);
  const all = scanCommandArgs(snapshot.text, true).slice(1);
  let kind: CatalogKind | undefined;
  if (name === "theme" || name === "skill" || name === "tools") {
    if (preceding.length && !(preceding.length === 1 && preceding[0] === "--")) return undefined;
    if (all.length > (all[0]?.value === "--" ? 2 : 1)) return undefined;
    kind = name;
  } else {
    kind = navigationKind(name, preceding, token.value, all.length);
  }
  if (!kind || (!preceding.includes("--") && token.value.startsWith("-"))) return undefined;
  const prefix = snapshot.text.slice(command.to, snapshot.cursor).trimStart();
  const fixed = invocation?.getArgumentCompletions?.(prefix) ?? [];
  return { kind, token, snapshot, fixed };

}

export function catalogSuggestions(request: NonNullable<ReturnType<typeof catalogRequest>>, items: readonly Suggestion[]) {
  return matchSuggestions(request.token.value, [...request.fixed, ...items]).slice(0, 100).map(item =>
    completionEdit(item, request.snapshot, request.token.from, request.token.to, (item.value.startsWith("-") && request.token.before.length === 1 ? "-- " : "") + quoteCompletion(item.value, request.token.prefix)));
}

function navigationKind(name: string | undefined, preceding: readonly string[], current: string, count: number): CatalogKind | undefined {
  const syntax = name === "resume" ? resumeSyntax : name === "fork" ? forkSyntax : name === "tree" ? treeSyntax : name === "entries" ? entriesSyntax : undefined;
  if (!syntax) return undefined;
  const before = preceding.filter(value => value !== "--");
  if (preceding.some(value => value.startsWith("-") && value !== "--") || preceding.filter(value => value === "--").length > 1) return undefined;
  const action = preceding[0] === "--" ? undefined : syntax.actions.find(item => item.name && (item.name === before[0]?.toLowerCase() || item.aliases?.includes(before[0]?.toLowerCase() ?? "")));
  const currentAction = !before.length && syntax.actions.some(item => item.name && (item.name === current.toLowerCase() || item.aliases?.includes(current.toLowerCase())));
  if (currentAction && !preceding.includes("--")) return undefined;
  if (before.length && (!action || !action.parameters?.length || before.length !== 1)) return undefined;
  if (count > (action ? 2 : 1) + (preceding.includes("--") ? 1 : 0)) return undefined;
  if (name === "resume" || name === "fork") return "session";
  if (name === "tree") return "tree";
  return action?.name === "tree" ? "thread" : "entry";
}
