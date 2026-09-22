import type { CompactionOutcome } from "../../core/shell/compaction.js";

/**
 * The `/compact` line as the interactive session reads it.
 *
 * Bare `/compact`, or `/compact` followed by focus instructions, condenses the
 * live history. The handoff sub-forms (`preview`, `render`, `json`) are left to
 * the command registry, which writes artifacts rather than changing the context.
 */

const HANDOFF_FORMS = new Set(["preview", "render", "json"]);

export interface CompactRequest {
  readonly instructions?: string;
}

export function parseCompactCommand(prompt: string): CompactRequest | undefined {
  const parts = prompt.trim().split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (name !== "/compact" && name !== "/handoff") return undefined;
  const args = parts.slice(1).filter((part) => !part.startsWith("--"));
  if (args[0] && HANDOFF_FORMS.has(args[0].toLowerCase())) return undefined;
  const instructions = args.join(" ").trim();
  return instructions ? { instructions } : {};
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
