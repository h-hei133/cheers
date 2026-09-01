import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";
import { matchSuggestions } from "../../presentation/tui/chrome/suggestions.js";
import { listSlashCommands } from "../../entrypoints/slashCommandRegistry.js";

/**
 * Slash command completions.
 *
 * Candidates come from the command registry itself, so the menu can only ever
 * offer commands the router actually dispatches — a hand-maintained list drifts
 * and ends up advertising commands that fail when chosen.
 */

let cached: readonly Suggestion[] | undefined;

/** Registry commands as completion candidates, built once per process. */
function candidates(): readonly Suggestion[] {
  cached ??= listSlashCommands().map((command) => ({
    value: `/${command.name}`,
    label: `/${command.name}`,
    detail: command.summary,
  }));
  return cached;
}

/**
 * Completions for the current draft, or null when completion does not apply —
 * the draft is not a command, or the command name is already complete and the
 * user has moved on to arguments.
 */
export function slashSuggestions(draft: string): Suggestion[] | null {
  const trimmed = draft.trimStart();
  if (!trimmed.startsWith("/")) return null;
  if (/\s/.test(trimmed)) return null;
  const matches = matchSuggestions(trimmed, candidates());
  return matches.length > 0 ? matches : null;
}
