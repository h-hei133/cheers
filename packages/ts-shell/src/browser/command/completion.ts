import { browserSyntax, actionSyntax, replaySyntax, cacheSyntax, repairSyntax } from "./syntax.js";
import { syntaxCompletions } from "../../core/commands/syntax/projection.js";
import { scanCommandArgs } from "../../core/commands/arguments.js";

/** Follow the same owner branches; accepting a candidate never adds confirmation. */
export function browserCompletions(prefix: string) {
  const tokens = scanCommandArgs(prefix, true);
  const first = tokens[0];
  if (!first || tokens.length === 1 && !/\s$/.test(prefix)) return syntaxCompletions(browserSyntax, prefix);
  const tail = prefix.slice(first.to).trimStart();
  const mode = first.value.toLowerCase();
  if (["preview", "dry-run", "execute"].includes(mode)) return syntaxCompletions(actionSyntax, tail);
  if (mode === "repair") return syntaxCompletions(repairSyntax, tail);
  if (mode === "replay") {
    const child = tokens[1];
    if (child?.value.toLowerCase() === "cache" && (tokens.length > 2 || /\s$/.test(prefix))) return syntaxCompletions(cacheSyntax, prefix.slice(child.to).trimStart());
    return syntaxCompletions(replaySyntax, tail);
  }
  return syntaxCompletions(browserSyntax, prefix);
}
