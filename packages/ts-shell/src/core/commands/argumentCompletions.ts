import { loadCatalog } from "../models/catalogStore.js";
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
  model: ["use", "list", "status", "help"],
  fast: ["on", "off", "toggle", "enable", "disable"],
  log: ["tail", "path", "export", "clear"],
  view: ["status", "user", "developer"],
  goal: ["pause", "resume", "complete", "clear"],
  workflow: ["list", "run", "status"],
  marketplace: ["list", "add", "remove", "rm", "delete"],
  plugin: ["list", "add", "remove", "search", "enable", "disable"],
  memory: ["inspect", "add", "recall", "use", "invalidate", "save", "status", "review"],
  connect: ["status", "list", "presets", "login", "set", "use", "logout", "help"],
  compact: ["preview", "render", "json"],
  warmup: ["status", "rebuild"],
  resume: ["list", "current", "switch", "help", "panel", "ls", "active", "use"],
  mcp: ["status", "tools", "doctor", "refresh"],
  permissions: ["list", "explain", "revoke", "reset"],
  workspace: ["status", "attach", "recent"],
  sidebar: ["snapshot", "panel", "compact", "detail"],
  browser: ["status", "smoke", "runtime", "preview", "dry-run", "execute", "replay", "repair"],
  restore: ["preview", "execute"],
  brainstorm: ["-i", "-s"],
  export: ["jsonl"],
  shell: ["status", "use", "auto"],
  statusline: ["list", "use"],
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

/** `/shell use <backend>` — the second token enumerates backends. */
export function shellArgumentCompletions(
  prefix: string,
): readonly CommandArgumentCompletion[] | null {
  const space = prefix.indexOf(" ");
  if (space < 0) return subcommandCompletions("shell", prefix);
  const matches = prefixFilter(["bash", "git-bash", "powershell", "wsl", "auto"], prefix.slice(space + 1));
  return matches.length > 0 ? matches : null;
}

/** `/model use …` — provider/model pairs from the local catalogue snapshot. */
export function modelArgumentCompletions(
  prefix: string,
): readonly CommandArgumentCompletion[] | null {
  const space = prefix.indexOf(" ");
  if (space < 0) return subcommandCompletions("model", prefix);
  const target = prefix.slice(space + 1).trim().toLowerCase();
  const pairs = loadCatalog().flatMap((provider) =>
    provider.models.map((model) => `${provider.id}/${model.id}`),
  );
  if (pairs.length === 0) return null;
  const matches = pairs
    .filter((pair) => pair.toLowerCase().includes(target))
    .slice(0, 50)
    .map((pair) => ({ value: pair, label: pair }));
  return matches.length > 0 ? matches : null;
}

/** `/loop [attempts] <gate>` — only the leading count is enumerable. */
export function loopArgumentCompletions(
  prefix: string,
): readonly CommandArgumentCompletion[] | null {
  if (/\s/.test(prefix)) return null;
  const matches = prefixFilter(["3", "5", "10"], prefix, "attempts");
  return matches.length > 0 ? matches : null;
}
