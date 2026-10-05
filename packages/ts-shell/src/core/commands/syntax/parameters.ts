import type { CommandSyntax } from "./model.js";
import { parseSyntax } from "./parse.js";
import type { CommandArgumentCompletion } from "../types.js";

/** Only enumerate the next legal position after validating the completed tokens. */
export function parameterCompletions(syntax: CommandSyntax, before: readonly string[], query: string): readonly CommandArgumentCompletion[] | null {
  if (!before.length) return null;
  const parsed = parseSyntax(syntax, before, true);
  if (!parsed.ok) return null;
  let position = 0;
  for (const parameter of parsed.action.parameters ?? []) {
    if (parameter.rest || position === parsed.args.length) {
      const values = parameter.values?.filter(value => value.toLowerCase().startsWith(query.toLowerCase()) &&
        !(parameter.rest && parsed.args.slice(position).includes(value)));
      return values?.length ? values.map(value => ({ value, label: value })) : null;
    }
    position++;
  }
  return null;
}
