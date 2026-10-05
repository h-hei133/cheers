import type { CommandArgumentCompletion } from "./types.js";

/**
 * Argument candidates for slash commands.
 *
 * Every provider here is synchronous: the completion list is rebuilt on each
 * keystroke and cannot wait on I/O. Dynamic data comes from sources already
 * loaded in memory or from the local catalogue snapshot, never from the network.
 */

function prefixFilter(
  values: readonly string[],
  prefix: string,
  detail?: string,
): CommandArgumentCompletion[] {
  const lowered = prefix.toLowerCase();
  return values
    .filter((value) => value.toLowerCase().startsWith(lowered))
    .map((value) => ({ value, label: value, ...(detail ? { detail } : {}) }));
}

/**
 * First-token subcommand enumerations, mirroring what each handler parses.
 * Completing a value the handler would reject is worse than completing nothing,
 * so these lists come from the handler's own accepted set.
 */
const SUBCOMMAND_VALUES = {
  compact: ["preview", "render", "json"],
} as const;

export type EnumerableCommand = keyof typeof SUBCOMMAND_VALUES;

/** Candidates for a command whose first argument is one of a fixed set. */
export function subcommandCompletions(
  command: EnumerableCommand,
  prefix: string,
): readonly CommandArgumentCompletion[] | null {
  const matches = prefixFilter(SUBCOMMAND_VALUES[command], prefix);
  return matches.length > 0 ? matches : null;
}
