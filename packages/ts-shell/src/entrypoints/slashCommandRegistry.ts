import { resumeSyntax, forkSyntax } from "../core/commands/navigation/syntax.js";
import { syntaxHelp } from "../core/commands/syntax/projection.js";
import { commandInvocations, resolveCommandInvocation, type CommandInvocation } from "../core/commands/invocation.js";
import { listVisibleCommands } from "../core/commands/registry.js";
import { TemplateDiscoveryBudgetError } from "../core/prompts/templateLoader.js";
import type { CommandDefinition } from "../core/commands/types.js";
import { catalogContributions, observeCatalogContributions } from '../core/catalog/contributions.js';
import { helpReport } from '../core/commands/help/report.js';
import { reportText } from '../core/commands/report/projection.js';
import type { RuntimeConfig } from '../config/runtimeConfig.js';
import type { CommandRegistryOptions } from '../core/commands/registry.js';

export interface SlashCommandCompletion {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
}

export interface SlashCommandLineRenderer {
  renderLine(line: string): void;
}

export interface SlashCommandSpec {
  readonly composition?: CommandDefinition['composition'];
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
    ...(command.composition ? { composition: command.composition } : {}),
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

function builtinCommands(root?: string, runtimeConfig?: RuntimeConfig,
  options?: CommandRegistryOptions): readonly SlashCommandSpec[] {
  return listVisibleCommands(root, runtimeConfig, options).map(project);
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
export interface SlashCatalogScope {
  readonly root: string;
  readonly sessionId?: string;
  readonly runtimeConfig?: RuntimeConfig;
}
const listeners = new Set<() => void>();
observeCatalogContributions(undefined, () => { for (const listener of listeners) listener(); });

function allCommands(scope?: SlashCatalogScope, options?: CommandRegistryOptions): readonly SlashCommandSpec[] {
  const builtins = [...builtinCommands(scope?.root, scope?.runtimeConfig, options),
    ...catalogContributions(scope?.root, scope?.sessionId).flatMap(entry => entry.commands).map(project)];
  return extensions.length === 0 ? builtins : [...builtins, ...extensions];
}

function exactTemplateOptions(name: string): CommandRegistryOptions {
  return { templates: { names: new Set([name.replace(/^\//, '').trim().toLowerCase()]) } };
}

export function listSlashCommands(scope?: SlashCatalogScope): readonly SlashCommandSpec[] {
  return allCommands(scope);
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
    if (getSlashInvocation(invocation.name, undefined, exactTemplateOptions(invocation.name))) {
      throw new Error(`Slash command already registered: ${invocation.name}`);
    }
  }
  extensions.push(registered);
  for (const listener of listeners) listener();
  return () => {
    const index = extensions.indexOf(registered);
    if (index < 0) return;
    extensions.splice(index, 1);
    for (const listener of listeners) listener();
  };
}

export function subscribeSlashCommands(listener: (commands: readonly SlashCommandSpec[]) => void, scope?: SlashCatalogScope,
  isCurrent: () => boolean = () => true): () => void {
  const changed = () => { if (isCurrent()) listener(allCommands(scope)); }; listeners.add(changed);
  changed();
  return () => listeners.delete(changed);
}

export function listSlashInvocations(scope?: SlashCatalogScope,
  options?: CommandRegistryOptions): readonly CommandInvocation[] {
  return allCommands(scope, options).flatMap(commandInvocations);
}

export function getSlashInvocation(name: string, scope?: SlashCatalogScope,
  options?: CommandRegistryOptions): CommandInvocation | undefined {
  const builtin = resolveCommandInvocation(allCommands(scope, { includeTemplates: false }), name);
  if (builtin) return builtin;
  const exact = options ?? exactTemplateOptions(name);
  try {
    return resolveCommandInvocation(allCommands(scope, exact), name);
  } catch (error) {
    if (!options && error instanceof TemplateDiscoveryBudgetError) return undefined;
    throw error;
  }
}

export function getSlashCommand(name: string, scope?: SlashCatalogScope): SlashCommandSpec | undefined {
  const commands = allCommands(scope);
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

/**
 * The command guide, generated from the registry.
 *
 * A hand-written guide drifts the moment a command is added or retired — it kept
 * advertising commands the router had already stopped accepting. Generating it
 * means the guide cannot describe a command that does not exist, and cannot omit
 * one that does.
 */
export function renderUserHelp(renderer: SlashCommandLineRenderer, scope?: SlashCatalogScope): void {
  renderer.renderLine(reportText(helpReport(listSlashCommands(scope), scope?.root ?? process.cwd())));
}
