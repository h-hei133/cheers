import { resumeSyntax, forkSyntax, treeSyntax, entriesSyntax, parseNavigationArgs } from "../../../core/commands/navigation/syntax.js";
import { parseSyntax } from "../../../core/commands/syntax/parse.js";
import { mcpSyntax } from "../../../core/commands/mcp/syntax.js";
import { permissionsSyntax } from "../../../core/commands/permissions/syntax.js";
import { connectSyntax } from "../../../core/commands/connect/syntax.js";
import { memorySyntax } from "../../../memory/commands/syntax.js";
import type { MemoryCatalogKind } from "./memory.js";
import { pathKind } from "./pathRequest.js";
import { pathDirectory } from "./paths.js";
import { modelKind } from "./models.js";
import { firstParameter } from "./position.js";
import { workflowSyntax } from "../../../core/workflow/syntax.js";
import { scanCommandArgs } from "../../../core/commands/arguments.js";
import { completionToken, completionEdit, quoteCompletion } from "../completion.js";
import { getSlashInvocation } from "../../../entrypoints/slashCommandRegistry.js";
import type { DraftSnapshot } from "../../../presentation/tui/editor/replacement.js";
import { matchSuggestions, type Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type CatalogKind = "theme" | "skill" | "tools" | "session" | "entry" | "tree" | "thread" | "mcp" | "grant" | "connection" | "file" | "directory" | "model" | "provider" | "workflow" | MemoryCatalogKind;

export function catalogRequest(snapshot: DraftSnapshot) {
  const token = completionToken(snapshot.text, snapshot.cursor);
  const command = token.before[0];
  if (!command || !/^\/[A-Za-z0-9:._?-]+$/.test(snapshot.text.slice(command.from, command.to))) return undefined;
  const invocation = getSlashInvocation(command.value);
  if (!invocation || invocation.kind === "named") return undefined;
  const name = invocation?.commandName;
  const preceding = token.before.slice(1).map(item => item.value);
  const all = scanCommandArgs(snapshot.text, true).slice(1);
  const following = all.filter(item => item.from >= token.to && item.from > snapshot.cursor).map(item => item.value);
  let kind: CatalogKind | undefined;
  if (name === "theme" || name === "skill" || name === "tools") {
    if (preceding.length && !(preceding.length === 1 && preceding[0] === "--")) return undefined;
    if (all.length > (all[0]?.value === "--" ? 2 : 1)) return undefined;
    kind = name;
  } else if (name === "model") {
    kind = modelKind(preceding, token.value, following);
  } else if (name === "mcp" || name === "permissions" || name === "connect" || name === "memory" || name === "workflow") {
    const syntax = name === "mcp" ? mcpSyntax : name === "connect" ? connectSyntax : name === "memory" ? memorySyntax : name === "workflow" ? workflowSyntax : permissionsSyntax;
    const parsed = firstParameter(input => parseSyntax(syntax, input), preceding, following);
    const action = parsed?.action;
    if (name === "permissions" && action?.name !== "revoke") return undefined;
    if (name === "connect" && action?.name !== "use" && action?.name !== "logout") return undefined;
    if (name === "workflow" && action?.name !== "run") return undefined;
    const memoryKind = action?.name === "delete" ? "record" : action?.name === "invalidate" ? "invalidatable" : action?.name === "approve" ? "approvable" : action?.name === "reject" ? "candidate" : action?.name === "save" ? "approved" : undefined;
    if (!parsed || (name === "memory" && !memoryKind)) return undefined;
    kind = name === "mcp" ? "mcp" : name === "connect" ? "connection" : name === "memory" ? memoryKind : name === "workflow" ? "workflow" : "grant";
  } else {
    kind = pathKind(name, preceding, following) ?? navigationKind(name, preceding, token.value, following);
  }
  if (!kind || (!preceding.includes("--") && token.value.startsWith("-"))) return undefined;
  const prefix = snapshot.text.slice(command.to, snapshot.cursor).trimStart();
  const fixed = [...(invocation?.getArgumentCompletions?.(prefix) ?? []),
    ...(kind === "approved" ? [{ value: "approved", label: "approved", detail: "save all approved candidates" }] : [])];
  return { kind, token, snapshot, fixed, query: kind === "file" || kind === "directory" ? pathDirectory(token.value) : undefined };

}

export function catalogSuggestions(request: NonNullable<ReturnType<typeof catalogRequest>>, items: readonly Suggestion[]) {
  return matchSuggestions(request.token.value, [...request.fixed, ...items]).slice(0, 100).map(item => {
    const text = (item.value.startsWith("-") && !request.token.before.some(token => token.value === "--") ? "-- " : "") + quoteCompletion(item.value, request.token.prefix);
    if ((request.kind === "file" || request.kind === "directory") && item.value.endsWith("/")) {
      return { ...item, edit: { snapshot: request.snapshot, from: request.token.from, to: request.token.to, text,
        cursorOffset: text.length - (text.endsWith('"') || text.endsWith("'") ? 1 : 0) } };
    }
    return completionEdit(item, request.snapshot, request.token.from, request.token.to, text);
  });
}

function navigationKind(name: string | undefined, preceding: readonly string[], current: string, following: readonly string[]): CatalogKind | undefined {
  const syntax = name === "resume" ? resumeSyntax : name === "fork" ? forkSyntax : name === "tree" ? treeSyntax : name === "entries" ? entriesSyntax : undefined;
  if (!syntax) return undefined;
  if (!preceding.length && syntax.actions.some(item => item.name && (item.name === current.toLowerCase() || item.aliases?.includes(current.toLowerCase())))) return undefined;
  const parsed = firstParameter(input => name === "fork" ? parseSyntax(syntax, input) : parseNavigationArgs(syntax, input), preceding, following);
  if (!parsed) return undefined;
  if (name === "resume" || name === "fork") return "session";
  if (name === "tree") return "tree";
  return parsed.action.name === "tree" ? "thread" : "entry";
}
