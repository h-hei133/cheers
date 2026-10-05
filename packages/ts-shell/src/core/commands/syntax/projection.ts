import type { CommandArgumentCompletion } from "../types.js";
import { scanCommandArgs } from "../arguments.js";
import type { CommandAction, CommandSyntax } from "./model.js";
import { parseFlags } from "./flags.js";
import { parseSyntax } from "./parse.js";
import { parameterCompletions } from "./parameters.js";

function actionUsage(action: CommandAction, enumerate = false): string {
  return [action.name, ...(action.parameters ?? []).map(parameter => {
    const label = (enumerate ? parameter.values?.join("|") ?? parameter.name : parameter.name) + (parameter.rest ? "..." : "");
    return parameter.required ? `<${label}>` : `[${label}]`;
  })].filter(Boolean).join(" ") + flagUsage(action);
}

export function syntaxHint(syntax: CommandSyntax): string {
  const actions = syntax.actions.filter(action => action.name || action.parameters?.length).map(action => actionUsage(action)).join("|");
  return `${actions ? `[${actions}]` : ""}${flagUsage(syntax)}`.trim();
}

export function syntaxHelp(syntax: CommandSyntax): string {
  return "Usage: " + syntax.actions.map(action => {
    const usage = actionUsage(action, true);
    return `/${syntax.name}${usage ? " " : ""}${usage}`;
  }).join(" | ") + flagUsage(syntax);
}

function flagUsage(syntax: Pick<CommandSyntax, "flags">): string {
  return (syntax.flags ?? []).map(flag => ` [--${flag.name}${flag.kind === "text" ? ` <${flag.values?.join("|") ?? "value"}>` : ""}]`).join("");
}

/** Fixed actions and their real aliases; free text and IDs have no invented candidates. */
export function syntaxCompletions(syntax: CommandSyntax, prefix: string): readonly CommandArgumentCompletion[] | null {
  const tokens = scanCommandArgs(prefix, true);
  const current = /\s$/.test(prefix) ? undefined : tokens.at(-1);
  const before = current ? tokens.slice(0, -1) : tokens;
  const query = (current?.value ?? "").toLowerCase();
  const parameters = parameterCompletions(syntax, before.map(token => token.value), query);
  if (parameters) return parameters;
  const first = before[0]?.value.toLowerCase();
  const action = syntax.actions.find(item => item.name.toLowerCase() === first || item.aliases?.some(alias => alias.toLowerCase() === first));
  if (action?.flags) syntax = { ...syntax, flags: [...(syntax.flags ?? []), ...action.flags] };
  if (syntax.flags) {
    if (before.some(token => token.value === "--")) return null;
    const last = before.at(-1)?.value;
    const awaiting = syntax.flags.find(flag => flag.kind === "text" && [flag.name, ...(flag.aliases ?? [])].some(name => last === `--${name}`));
    if (awaiting) {
      if (awaiting.suggest === false) return null;
      const values = awaiting.values?.filter(value => value.startsWith(query)).map(value => ({ value, label: value, detail: awaiting.summary }));
      return values?.length ? values : null;
    }
    const parsed = parseFlags(syntax.flags, before.map(token => token.value));
    if (!parsed.ok) return null;
    if (query.startsWith("-") || (query === "" && (parsed.args.length > 0 || (syntax.actions.length === 1 && syntax.actions[0]?.name === "")))) {
      if (parsed.args.length && !parseSyntax(syntax, before.map(token => token.value)).ok) return null;
      const matches = syntax.flags.filter(flag => flag.suggest !== false && (flag.repeatable || !parsed.flags.has(flag.name)) && !flag.conflicts?.some(name => parsed.flags.has(name)) && !(flag.conflictsWithArguments && parsed.args.length > 1))
        .flatMap(flag => [`--${flag.name}`, ...(query ? (flag.aliases ?? []).map(name => `--${name}`) : []), ...(query && flag.short ? [`-${flag.short}`] : [])].map(value => ({ value, label: value, detail: flag.summary })))
        .filter(candidate => candidate.value.startsWith(query));
      return matches.length ? matches : null;
    }
    if (parsed.args.length) return null;
  } else if (before.length) return null;
  const matches = syntax.actions.flatMap(action => [action.name, ...(query ? action.aliases ?? [] : [])]
    .filter(name => name && name.toLowerCase().startsWith(query))
    .map(name => ({ value: name, label: name, detail: action.summary })));
  return matches.length ? matches : null;
}
