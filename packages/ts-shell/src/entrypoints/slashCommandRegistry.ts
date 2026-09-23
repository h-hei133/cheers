import { listVisibleCommands } from "../core/commands/registry.js";
import type { CommandDefinition } from "../core/commands/types.js";

export interface SlashCommandCompletion {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
}

export interface SlashCommandLineRenderer {
  renderLine(line: string): void;
}

export interface SlashCommandSpec {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly group:
    | "session"
    | "context"
    | "workspace"
    | "workflow"
    | "diagnostics";
  readonly summary: string;
  readonly argumentHint?: string;
  readonly getArgumentCompletions?: (
    argumentPrefix: string,
  ) => readonly SlashCommandCompletion[] | null;
}

/**
 * The display registry is a projection of the dispatch registry.
 *
 * Two hand-maintained lists drifted: the completion menu advertised commands
 * the router had stopped accepting, and the router accepted commands the menu
 * never showed. Projecting from the dispatch side makes that impossible — a
 * command appears in the menu exactly when the router can run it.
 */
function project(command: CommandDefinition): SlashCommandSpec {
  return {
    name: command.name,
    ...(command.aliases ? { aliases: command.aliases } : {}),
    group: command.group,
    summary: command.summary,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
    ...(command.getArgumentCompletions
      ? { getArgumentCompletions: command.getArgumentCompletions }
      : {}),
  };
}

function builtinCommands(): readonly SlashCommandSpec[] {
  return listVisibleCommands().map(project);
}

/**
 * Commands the interactive surface handles directly (picker overlay) without a
 * dispatch-registry handler. They live here so the completion menu and the
 * guide can show them, but the router never sees them — `opensPicker` intercepts
 * the bare form before routing. The picker table (`picker/registry.ts`) owns
 * the behavior; this entry carries only what the menu and guide display.
 */
const PICKER_ONLY: readonly SlashCommandSpec[] = [
  {
    name: "statusline",
    aliases: ["status"],
    group: "workspace",
    summary: "choose which facts the status band keeps in view",
    argumentHint: "use <preset|item...>",
  },
  {
    name: "back",
    group: "session",
    summary: "ask an earlier question again, keeping the rest of the conversation",
  },
];

const extensions: SlashCommandSpec[] = [...PICKER_ONLY];
const listeners = new Set<(commands: readonly SlashCommandSpec[]) => void>();

function allCommands(): readonly SlashCommandSpec[] {
  const builtins = builtinCommands();
  return extensions.length === 0 ? builtins : [...builtins, ...extensions];
}

export function listSlashCommands(): readonly SlashCommandSpec[] {
  return allCommands();
}

export function registerSlashCommand(command: SlashCommandSpec): () => void {
  if (getSlashCommand(command.name)) throw new Error(`Slash command already registered: ${command.name}`);
  extensions.push(command);
  for (const listener of listeners) listener(allCommands());
  return () => {
    const index = extensions.indexOf(command);
    if (index < 0) return;
    extensions.splice(index, 1);
    for (const listener of listeners) listener(allCommands());
  };
}

export function subscribeSlashCommands(listener: (commands: readonly SlashCommandSpec[]) => void): () => void {
  listeners.add(listener);
  listener(allCommands());
  return () => listeners.delete(listener);
}

export function getSlashCommand(name: string): SlashCommandSpec | undefined {
  const normalized = name.replace(/^\//, "").trim().toLowerCase();
  return allCommands().find((command) => command.name === normalized || command.aliases?.includes(normalized));
}

export function isKnownSlashCommand(name: string): boolean {
  return getSlashCommand(name) !== undefined;
}

export function renderSessionCommandMap(
  renderer: SlashCommandLineRenderer,
  options?: { compact?: boolean; includeHelpHint?: boolean },
): void {
  const compact = options?.compact === true;
  const includeHelpHint = options?.includeHelpHint !== false;
  renderer.renderLine(
    compact ? "Session command map:" : "\nSession command map",
  );
  renderer.renderLine(
    "- /resume              open the session surface (interactive panel in TTY; overview in print/non-TTY).",
  );
  renderer.renderLine("- /resume current      inspect the active session.");
  renderer.renderLine(
    "- /resume list         inspect recent sessions for this project.",
  );
  renderer.renderLine(
    "- /resume switch <id|prefix|title|last> switch active session and project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume the best recoverable context.",
  );
  if (includeHelpHint) {
    renderer.renderLine("- /help                show full command guide.");
  }
}

const GROUP_TITLES: Record<SlashCommandSpec["group"], string> = {
  session: "Session",
  context: "Context",
  workspace: "Workspace",
  workflow: "Workflow",
  diagnostics: "Diagnostics",
};

/**
 * The command guide, generated from the registry.
 *
 * A hand-written guide drifts the moment a command is added or retired — it kept
 * advertising commands the router had already stopped accepting. Generating it
 * means the guide cannot describe a command that does not exist, and cannot omit
 * one that does.
 */
export function renderUserHelp(renderer: SlashCommandLineRenderer): void {
  const commands = allCommands();
  const width = longestName(commands);
  renderer.renderLine("\nSlash commands");
  for (const group of Object.keys(GROUP_TITLES) as SlashCommandSpec["group"][]) {
    const inGroup = commands.filter((command) => command.group === group);
    if (inGroup.length === 0) continue;
    renderer.renderLine(`\n${GROUP_TITLES[group]}`);
    for (const command of inGroup) {
      renderer.renderLine(`  /${command.name.padEnd(width)}  ${command.summary}`);
    }
  }
  // The keys live in one table that the keymap dispatches on; naming a few of
  // them again here is how a guide ends up advertising a key nothing binds.
  renderer.renderLine("\nKeys");
  renderer.renderLine("  shift+tab   switch between planning and building");
  renderer.renderLine("  alt+p       cycle how much a turn may do without asking");
  renderer.renderLine("  ctrl+j      insert a newline without sending");
  renderer.renderLine("  /hotkey     every key, and which ones this terminal delivers");
  renderer.renderLine("");
}

/** Longest command name, so summaries line up in one column. */
function longestName(commands: readonly SlashCommandSpec[]): number {
  let longest = 0;
  for (const command of commands) longest = Math.max(longest, command.name.length);
  return longest;
}
