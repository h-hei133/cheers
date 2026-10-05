import type { CommandAction, CommandParameter, CommandSyntax } from "./model.js";

export type SyntaxResult<Action> =
  | { readonly ok: true; readonly action: Action; readonly args: readonly string[] }
  | { readonly ok: false; readonly reason: string };

function validValue(parameter: CommandParameter, value: string): boolean {
  if (parameter.kind === "text") return value.trim().length > 0;
  if (!/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= (parameter.minimum ?? 0);
}

/** Validate before the owner reads or changes state; never coerce an unknown action. */
export function parseSyntax<Action extends CommandAction>(syntax: CommandSyntax<Action>, input: readonly string[]): SyntaxResult<Action> {
  const name = input.length ? input[0]!.toLowerCase() : syntax.defaultAction;
  const action = syntax.actions.find(item => item.name === name || item.aliases?.includes(name ?? ""));
  if (!action) return { ok: false, reason: "Unknown action." };
  const args = input.slice(1);
  let position = 0;
  for (const parameter of action.parameters ?? []) {
    const values = parameter.rest ? args.slice(position) : args.slice(position, position + 1);
    if (parameter.required && values.length === 0) return { ok: false, reason: `Missing ${parameter.name}.` };
    if ((parameter.rest && parameter.kind === "text"
      ? values.length > 0 && !validValue(parameter, values.join(" "))
      : values.some(value => !validValue(parameter, value)))) return { ok: false, reason: `Invalid ${parameter.name}.` };
    position += values.length;
  }
  if (position !== args.length) return { ok: false, reason: "Unexpected arguments." };
  return { ok: true, action, args };
}
