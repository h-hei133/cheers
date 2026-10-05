import { tokenizeCommandArgs } from "../../core/commands/arguments.js";
import { parseCompactSyntax } from "../../context/compact/command/syntax.js";
import type { CompactionOutcome } from "../../core/shell/compaction.js";

/**
 * The `/compact` line as the interactive session reads it.
 *
 * Bare `/compact`, or `/compact` followed by focus instructions, condenses the
 * live history. The handoff sub-forms (`preview`, `render`, `json`) are left to
 * the command registry, which writes artifacts rather than changing the context.
 */

export interface CompactRequest {
  readonly instructions?: string;
}

export function parseCompactCommand(prompt: string): CompactRequest | undefined {
  const match = /^\s*\/(compact|handoff)(?:\s+([\s\S]*))?$/i.exec(prompt.trim());
  if (!match) return undefined;
  try {
    const parsed = parseCompactSyntax(tokenizeCommandArgs(match[2] ?? ""));
    // Invalid or artifact arguments belong to the registry's read-only path.
    if (!parsed.ok || parsed.artifact) return undefined;
    const instructions = parsed.args.join(" ").trim();
    return instructions ? { instructions } : {};
  } catch {
    return undefined;
  }
}

/** What to tell the user about a compaction, one fact per line. */
export function describeCompaction(outcome: CompactionOutcome): string[] {
  switch (outcome.status) {
    case "compacted":
      return [
        `Condensed ${outcome.summarized} earlier message${outcome.summarized === 1 ? "" : "s"} into a checkpoint; the latest ${outcome.kept} stay verbatim.`,
        `Estimated context: ~${outcome.tokensBefore.toLocaleString()} → ~${outcome.tokensAfter.toLocaleString()} tokens. The gauge shows the real size after the next response.`,
      ];
    case "nothing":
      return [outcome.reason];
    case "busy":
      return ["A turn is still running; interrupt it or wait, then compact."];
    case "failed":
      return [`Compaction did not happen: ${outcome.reason}`];
  }
}
