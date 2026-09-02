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
 * A draft that is a command name being typed and nothing else.
 *
 * The leading slash alone is not enough: `/usr/local/bin` and `/etc/hosts` are
 * paths a user types as their first word, and popping a command menu over them
 * is noise. A command name has no second slash and no characters a name could
 * not contain, which is exactly what tells the two apart.
 */
const COMMAND_DRAFT = /^\/[A-Za-z0-9-]*$/;

/**
 * Completions for the current draft, or null when completion does not apply —
 * the draft is not a command name, or the name is complete and the user has
 * moved on to arguments.
 */
export function slashSuggestions(draft: string): Suggestion[] | null {
  const trimmed = draft.trimStart();
  if (!COMMAND_DRAFT.test(trimmed)) return null;
  const matches = matchSuggestions(trimmed, candidates());
  return matches.length > 0 ? matches : null;
}

/**
 * Whether the draft could still become a command, and so whether an edit to it
 * is allowed to reopen a list a typo closed.
 *
 * Without this the list never comes back: a mistyped name closes it, and
 * deleting the mistake produces a backspace, which carries no text and so was
 * treated as a gesture that may not open anything.
 */
export function couldBeCommand(draft: string): boolean {
  return COMMAND_DRAFT.test(draft.trimStart());
}
