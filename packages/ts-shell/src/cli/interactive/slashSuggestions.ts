import { completionToken, completionEdit, quoteCompletion } from "./completion.js";
import type { DraftSnapshot } from "../../presentation/tui/editor/replacement.js";
import type { Suggestion } from "../../presentation/tui/chrome/suggestions.js";
import { matchSuggestions } from "../../presentation/tui/chrome/suggestions.js";
import { reportMetadata } from "../../core/commands/report/metadata.js";
import {
  listSlashInvocations,
  getSlashInvocation,
  subscribeSlashCommands,
  type SlashCatalogScope,
} from "../../entrypoints/slashCommandRegistry.js";

let cached: readonly Suggestion[] | undefined;
let unsubscribe: (() => void) | undefined;
let cachedScope: string | undefined;

function candidates(scope?: SlashCatalogScope): readonly Suggestion[] {
  unsubscribe ??= subscribeSlashCommands(() => {
    cached = undefined;
  });
  const selected = JSON.stringify(scope ?? { root: process.cwd() });
  if (cachedScope !== selected) { cached = undefined; cachedScope = selected; }
  if (!cached) {
    const suggestions = new Map<string, Suggestion>();
    const invocations = listSlashInvocations(scope);
    for (const invocation of invocations) {
      if (invocation.kind === "alias") continue;
      const detail = invocation.argumentHint ? `${invocation.summary} ${invocation.argumentHint}` : invocation.summary;
      suggestions.set(invocation.name, {
        value: invocation.invocation,
        label: invocation.invocation,
        detail,
      });
    }
    cached = [...suggestions.values()];
  }
  return cached;
}

export function slashSuggestions(draft: string, snapshot: DraftSnapshot = { text: draft, cursor: draft.length, revision: 0 }, scope?: SlashCatalogScope): Suggestion[] | null {
  const token = completionToken(draft, snapshot.cursor);
  if (token.before.length === 0 && COMMAND_DRAFT.test(token.prefix)) {
    const matches = matchSuggestions(token.prefix, candidates(scope));
    return matches.length ? matches.map(candidate => completionEdit(candidate, snapshot, token.from, token.to)) : null;
  }
  const command = token.before[0];
  if (!command || !COMMAND_DRAFT.test(draft.slice(command.from, command.to))) return null;
  const invocation = getSlashInvocation(command.value, scope);
  const prefix = [...token.before.slice(1).map(item => item.value), token.value].join(" ");
  const values = invocation?.getArgumentCompletions?.(prefix);
  return values?.length ? values.map(candidate => completionEdit(candidate, snapshot, token.from, token.to,
    quoteCompletion(candidate.value, token.prefix))) : null;
}

/** Usage is informational: it must never become a selectable or executable entry. */
export function slashArgumentHint(snapshot: DraftSnapshot, scope?: SlashCatalogScope): string | undefined {
  const command = completionToken(snapshot.text, snapshot.cursor).before[0];
  if (!command || !COMMAND_DRAFT.test(snapshot.text.slice(command.from, command.to))) return undefined;
  const invocation = getSlashInvocation(command.value, scope);
  if (!invocation?.argumentHint) return undefined;
  const root = scope?.root ?? process.cwd();
  return `Usage: /${reportMetadata(invocation.name, root)} ${reportMetadata(invocation.argumentHint, root)}`;
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
