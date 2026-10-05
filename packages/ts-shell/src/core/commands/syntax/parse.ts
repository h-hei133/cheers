import type { CommandAction, CommandParameter, CommandSyntax } from "./model.js";
import { parseFlags } from "./flags.js";

export type SyntaxResult<Action> =
  | { readonly ok: true; readonly action: Action; readonly args: readonly string[]; readonly flags: ReadonlyMap<string, string | true> }
  | { readonly ok: false; readonly reason: string };

function validValue(parameter: CommandParameter, value: string): boolean {
  if (parameter.values && !parameter.values.includes(value)) return false;
  if (parameter.kind === "text") return value.trim().length > 0;
  if (!/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= (parameter.minimum ?? 0);
}

/** Validate before the owner reads or changes state; never coerce an unknown action. */
export function parseSyntax<Action extends CommandAction>(syntax: CommandSyntax<Action>, input: readonly string[], partial = false): SyntaxResult<Action> {
  const first = input[0]?.toLowerCase();
  const initial = syntax.actions.find(item => item.name.toLowerCase() === first || item.aliases?.some(alias => alias.toLowerCase() === first));
  const definitions = initial?.flags ? [...(syntax.flags ?? []), ...initial.flags] : syntax.flags;
  const options = definitions ? parseFlags(definitions, input) : { ok: true as const, args: input, flags: new Map<string, string | true>() };
  if (!options.ok) return options;
  const name = options.args.length ? options.args[0]!.toLowerCase() : syntax.defaultAction;
  const action = syntax.actions.find(item => item.name.toLowerCase() === name || item.aliases?.some(alias => alias.toLowerCase() === name));
  if (!action) return { ok: false, reason: "Unknown action." };
  const args = options.args.slice(1);
  if (args.length && definitions?.some(flag => flag.conflictsWithArguments && options.flags.has(flag.name))) {
    return { ok: false, reason: "Option conflicts with positional arguments." };
  }
  let position = 0;
  for (const parameter of action.parameters ?? []) {
    const values = parameter.rest ? args.slice(position) : args.slice(position, position + 1);
    if (!partial && parameter.required && values.length === 0) return { ok: false, reason: `Missing ${parameter.name}.` };
    if ((parameter.rest && parameter.kind === "text" && !parameter.values
      ? values.length > 0 && !validValue(parameter, values.join(" "))
      : values.some(value => !validValue(parameter, value)))) return { ok: false, reason: `Invalid ${parameter.name}.` };
    position += values.length;
  }
  if (position !== args.length) return { ok: false, reason: "Unexpected arguments." };
  return { ok: true, action, args, flags: options.flags };
}
