import type { CommandAction } from "../../../core/commands/syntax/model.js";
import type { SyntaxResult } from "../../../core/commands/syntax/parse.js";

/** Check the edited slot against the owner's full grammar without accepting a typed value. */
export function firstParameter<Action extends CommandAction>(
  parse: (input: readonly string[]) => SyntaxResult<Action>,
  before: readonly string[],
  after: readonly string[],
) {
  const existing = new Set([...before, ...after]);
  let placeholder = "completion-target";
  while (existing.has(placeholder)) placeholder += "_";
  const parsed = parse([...before, placeholder, ...after]);
  return parsed.ok && parsed.args[0] === placeholder ? parsed : undefined;
}
