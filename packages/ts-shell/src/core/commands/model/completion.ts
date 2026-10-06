import { scanCommandArgs } from "../arguments.js";
import { syntaxCompletions } from "../syntax/projection.js";
import type { CommandArgumentCompletion } from "../types.js";
import { modelSyntax } from "./syntax.js";

/** Synchronous syntax only; model entities are loaded by the input surface. */
export function modelArgumentCompletions(prefix: string): readonly CommandArgumentCompletion[] | null {
  const tokens = scanCommandArgs(prefix, true);
  const before = /\s$/.test(prefix) ? tokens : tokens.slice(0, -1);
  const first = before[0]?.value.toLowerCase();
  const action = modelSyntax.actions.find(item => item.name === first || item.aliases?.includes(first ?? ""));
  return syntaxCompletions(modelSyntax, !action && before.length ? `use ${prefix}` : prefix);
}
