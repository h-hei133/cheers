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
  const rest = parts.slice(1);
  const positional = rest.filter((part) => !part.startsWith("--"));
  // Both spellings of a handoff form count. The command parses `preview` as a
  // positional *and* `--preview` as a flag — `parseCompactCommandArgs` accepts
  // either, and the argument hint advertises `[preview|render|json]`. Reading
  // only the positional meant `--preview` was taken for focus instructions and
  // condensed the history, which is the opposite of a read-only form.
  if (positional[0] && HANDOFF_FORMS.has(positional[0].toLowerCase())) return undefined;
  if (rest.some((part) => part.startsWith("--") && HANDOFF_FORMS.has(part.slice(2).toLowerCase()))) {
    return undefined;
  }
  const instructions = positional.join(" ").trim();
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
