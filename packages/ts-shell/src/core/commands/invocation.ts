import type { CommandDefinition, NamedCommandInvocation } from "./types.js";

type CommandIdentity = Pick<CommandDefinition, "group" | "name" | "aliases" | "invocations" | "summary" | "argumentHint" | "argumentMode" | "getArgumentCompletions" | 'composition' | 'preparePrompt'>;

export interface CommandInvocation extends NamedCommandInvocation {
  /** The handler's owner, distinct from the spelling that must be dispatched. */
  readonly commandName: string;
  readonly group: CommandDefinition["group"];
  readonly invocation: string;
  readonly kind: "command" | "alias" | "named";
}

export function commandInvocations(command: CommandIdentity): CommandInvocation[] {
  const names = new Set([command.name]);
  const result: CommandInvocation[] = [{
    group: command.group, name: command.name, commandName: command.name, invocation: `/${command.name}`, kind: "command",
    summary: command.summary, argumentHint: command.argumentHint, getArgumentCompletions: command.getArgumentCompletions,
    argumentMode: command.argumentMode,
    composition: command.composition,
    preparePrompt: command.preparePrompt,
  }];
  for (const alias of command.aliases ?? []) {
    if (names.has(alias)) continue;
    names.add(alias);
    result.push({ ...result[0]!, name: alias, invocation: `/${alias}`, kind: "alias" });
  }
  for (const invocation of command.invocations ?? []) {
    if (names.has(invocation.name)) throw new Error(`Conflicting command invocation: ${invocation.name}`);
    names.add(invocation.name);
    result.push({ ...invocation, group: command.group, commandName: command.name, invocation: `/${invocation.name}`, kind: "named" });
  }
  return result;
}

export function resolveCommandInvocation(commands: readonly CommandIdentity[], name: string): CommandInvocation | undefined {
  const normalized = name.replace(/^\//, "").trim().toLowerCase();
  for (const command of commands) {
    const invocation = commandInvocations(command).find(candidate => candidate.name === normalized);
    if (invocation) return invocation;
  }
  return undefined;
}

/** Preserve the same raw argument source for standalone dispatch and pure preview. */
export function parseCommandSource(input: string): { readonly name: string; readonly argsText: string } | undefined {
  const match = /^\/\s*(\S+)(?:(?:\r\n|\s)([\s\S]*))?$/.exec(input);
  return match?.[1] ? { name: match[1], argsText: match[2] ?? '' } : undefined;
}
