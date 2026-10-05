import { scanCommandArgs } from "../../../core/commands/arguments.js";
import { syntaxCompletions } from "../../../core/commands/syntax/projection.js";
import { COMPACT_MODES, compactSyntax } from "./syntax.js";

export function compactCompletions(prefix: string) {
  const first = scanCommandArgs(prefix, true)[0]?.value.toLowerCase();
  const hasMode = COMPACT_MODES.some(mode => mode === first);
  const syntax = hasMode ? {
    ...compactSyntax,
    flags: compactSyntax.flags?.filter(flag => !COMPACT_MODES.some(mode => mode === flag.name)),
  } : compactSyntax;
  return syntaxCompletions(syntax, prefix);
}
