import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";
import { matchSuggestions } from "../../presentation/tui/chrome/suggestions.js";
import {
  listSlashCommands,
  getSlashCommand,
  subscribeSlashCommands,
} from "../../entrypoints/slashCommandRegistry.js";

let cached: readonly Suggestion[] | undefined;
let unsubscribe: (() => void) | undefined;

function candidates(): readonly Suggestion[] {
  unsubscribe ??= subscribeSlashCommands(() => {
    cached = undefined;
  });
  if (!cached) {
    const suggestions = new Map<string, Suggestion>();
    for (const command of listSlashCommands()) {
      const detail = command.argumentHint ? `${command.summary} ${command.argumentHint}` : command.summary;
      for (const name of [command.name, ...(command.aliases ?? [])]) {
        // The registry resolves the first matching name or alias.
        if (suggestions.has(name)) continue;
        suggestions.set(name, {
          value: `/${name}`,
          label: `/${name}`,
          detail: name === command.name ? detail : `${detail} (alias of /${command.name})`,
        });
      }
    }
    cached = [...suggestions.values()];
  }
  return cached;
}

function argumentSuggestions(draft: string): Suggestion[] | null {
  const match = /^(\/[^\s]+)\s+(.*)$/.exec(draft.trimStart());
  if (!match) return null;
  const command = getSlashCommand(match[1]!);
  const values = command?.getArgumentCompletions?.(match[2]);
  // The provider already filtered by prefix; matchSuggestions would re-filter
  // with the whole argument text as query, which breaks multi-word arguments.
  return values && values.length > 0 ? [...values] : null;
}

export function slashSuggestions(draft: string): Suggestion[] | null {
  const trimmed = draft.trimStart();
  return argumentSuggestions(trimmed) ??
    (COMMAND_DRAFT.test(trimmed)
      ? ((matches) => (matches.length > 0 ? matches : null))(matchSuggestions(trimmed, candidates()))
      : null);
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
