import { resumeSyntax, forkSyntax } from "../core/commands/navigation/syntax.js";
import { syntaxHelp } from "../core/commands/syntax/projection.js";
import { commandInvocations, resolveCommandInvocation, type CommandInvocation } from "../core/commands/invocation.js";
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
  readonly invocations?: CommandDefinition["invocations"];
  readonly group:
    | "session"
    | "context"
    | "workspace"
    | "workflow"
    | "diagnostics";
  readonly summary: string;
  readonly supportsNonInteractive?: boolean;
  readonly argumentHint?: string;
  readonly argumentMode?: CommandDefinition["argumentMode"];
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
    ...(command.invocations ? { invocations: command.invocations } : {}),
    group: command.group,
    summary: command.summary,
    supportsNonInteractive: command.supportsNonInteractive === true,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
    ...(command.argumentMode ? { argumentMode: command.argumentMode } : {}),
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
  // `/back` alone. It needs the session's turns to choose from, so there is no
  // useful non-interactive form, and it carries no argument hint: the grammar it
  // once advertised (`rewind <n>`) is not a form the picker accepts. Anything
  // else that opens a picker is also a real command, and listing it here as well
  // would give it two summaries — the menu showed the stale one.
  {
    name: "back",
    supportsNonInteractive: false,
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
  // Own the registered snapshot so outside mutation cannot bypass invalidation.
  const registered = Object.freeze({
    ...command,
    aliases: command.aliases ? Object.freeze([...new Set(command.aliases)]) : undefined,
    invocations: command.invocations ? Object.freeze(command.invocations.map(value => Object.freeze({ ...value }))) : undefined,
  });
  for (const invocation of commandInvocations(registered)) {
    if (!/^(?:[a-z0-9][a-z0-9:._-]*|\?)$/.test(invocation.name)) throw new Error(`Invalid slash command name: ${invocation.name}`);
    if (getSlashInvocation(invocation.name)) throw new Error(`Slash command already registered: ${invocation.name}`);
  }
  extensions.push(registered);
  for (const listener of listeners) listener(allCommands());
  return () => {
    const index = extensions.indexOf(registered);
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

export function listSlashInvocations(): readonly CommandInvocation[] {
  return allCommands().flatMap(commandInvocations);
}

export function getSlashInvocation(name: string): CommandInvocation | undefined {
  return resolveCommandInvocation(allCommands(), name);
}

export function getSlashCommand(name: string): SlashCommandSpec | undefined {
  const commands = allCommands();
  const invocation = resolveCommandInvocation(commands, name);
  return commands.find(command => command.name === invocation?.commandName);
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
  renderer.renderLine(syntaxHelp(resumeSyntax));
  renderer.renderLine(syntaxHelp(forkSyntax));
  renderer.renderLine("Quote a multi-word session title. Fork creates a separate session; tree navigation stays in the current session.");
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
  const commands = listSlashInvocations().filter(invocation => invocation.kind !== "alias");
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
function longestName(commands: readonly { readonly name: string }[]): number {
  let longest = 0;
  for (const command of commands) longest = Math.max(longest, command.name.length);
  return longest;
}
