import type { CommandArgumentCompletion } from "../types.js";
import { scanCommandArgs } from "../arguments.js";
import type { CommandAction, CommandSyntax } from "./model.js";

function actionUsage(action: CommandAction): string {
  return [action.name, ...(action.parameters ?? []).map(parameter => {
    const label = parameter.name + (parameter.rest ? "..." : "");
    return parameter.required ? `<${label}>` : `[${label}]`;
  })].filter(Boolean).join(" ");
}

export function syntaxHint(syntax: CommandSyntax): string {
  return `[${syntax.actions.filter(action => action.name).map(action => actionUsage(action)).join("|")}]`;
}

export function syntaxHelp(syntax: CommandSyntax): string {
  return "Usage: " + syntax.actions.map(action => `/${syntax.name}${action.name ? " " : ""}${actionUsage(action)}`).join(" | ");
}

/** Fixed actions and their real aliases; free text and IDs have no invented candidates. */
export function syntaxCompletions(syntax: CommandSyntax, prefix: string): readonly CommandArgumentCompletion[] | null {
  const tokens = scanCommandArgs(prefix, true);
  if (tokens.length > 1 || (tokens.length === 1 && /\s$/.test(prefix))) return null;
  const query = (tokens[0]?.value ?? "").toLowerCase();
  const matches = syntax.actions.flatMap(action => [action.name, ...(query ? action.aliases ?? [] : [])]
    .filter(name => name && name.startsWith(query))
    .map(name => ({ value: name, label: name, detail: action.summary })));
  return matches.length ? matches : null;
}
