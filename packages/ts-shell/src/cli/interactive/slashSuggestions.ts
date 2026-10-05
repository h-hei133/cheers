import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";
import { matchSuggestions } from "../../presentation/tui/chrome/suggestions.js";
import {
  listSlashInvocations,
  getSlashInvocation,
  subscribeSlashCommands,
} from "../../entrypoints/slashCommandRegistry.js";

let cached: readonly Suggestion[] | undefined;
let defaults: readonly Suggestion[] | undefined;
let unsubscribe: (() => void) | undefined;

function candidates(includeAliases: boolean): readonly Suggestion[] {
  unsubscribe ??= subscribeSlashCommands(() => {
    cached = undefined;
    defaults = undefined;
  });
  if (!cached) {
    const suggestions = new Map<string, Suggestion>();
    const invocations = listSlashInvocations();
    for (const invocation of invocations) {
      const detail = invocation.argumentHint ? `${invocation.summary} ${invocation.argumentHint}` : invocation.summary;
      suggestions.set(invocation.name, {
        value: invocation.invocation,
        label: invocation.invocation,
        detail: invocation.kind === "alias" ? `${detail} (alias of /${invocation.commandName})` : detail,
      });
    }
    cached = [...suggestions.values()];
    defaults = invocations.filter(invocation => invocation.kind !== "alias").map(invocation => suggestions.get(invocation.name)!);
  }
  return includeAliases ? cached : defaults!;
}

function argumentSuggestions(draft: string): Suggestion[] | null {
  const match = /^(\/[^\s]+)\s+(.*)$/.exec(draft.trimStart());
  if (!match) return null;
  const command = getSlashInvocation(match[1]!);
  const values = command?.getArgumentCompletions?.(match[2]);
  // The provider already filtered by prefix; matchSuggestions would re-filter
  // with the whole argument text as query, which breaks multi-word arguments.
  return values && values.length > 0 ? [...values] : null;
}

export function slashSuggestions(draft: string): Suggestion[] | null {
  const trimmed = draft.trimStart();
  return argumentSuggestions(trimmed) ??
    (COMMAND_DRAFT.test(trimmed)
      ? ((matches) => (matches.length > 0 ? matches : null))(matchSuggestions(trimmed, candidates(trimmed !== "/")))
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
const COMMAND_DRAFT = /^\/[A-Za-z0-9:._?-]*$/;

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
