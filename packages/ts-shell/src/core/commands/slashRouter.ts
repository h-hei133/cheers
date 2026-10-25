import { commandInvocations, resolveCommandInvocation } from "./invocation.js";
import { createCommandRegistry } from "./registry.js";
import { composePrompt } from './composition.js';
import type { CommandContext, CommandExecutionResult, CommandDefinition } from "./types.js";
import { tokenizeCommandArgs } from "./arguments.js";
import { catalogContributions } from '../catalog/contributions.js';

export async function routeSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandExecutionResult | null> {
  const registry = createCommandRegistry(context.cwd, context.runtimeConfig);
  const opening = /^\/([^\s/]+)(?:\s|$)/.exec(input)?.[1];
  const openingCommand = opening ? resolveCommandInvocation([...registry.values()], opening) : undefined;
  const dynamic = catalogContributions(context.cwd, context.sessionId).flatMap(entry => entry.commands);
  const first = openingCommand ?? (opening ? resolveCommandInvocation(dynamic, opening) : undefined);
  if (!first || first.composition) {
    const composed = await composePrompt(input, context, [...registry.values(), ...dynamic]);
    if (composed) return composed;
  }
  if (!input.startsWith('/') || /^\/[^\s]*[\/\\]/.test(input)) return null;

  const invocation = /^\/\s*(\S+)(?:(?:\r\n|\s)([\s\S]*))?$/.exec(input);
  const rawName = invocation?.[1];
  const rawCommandArgs = invocation?.[2] ?? "";
  if (!rawName) {
    return {
      kind: "local",
      output: buildSlashDiscoveryMessage(),
    };
  }

  const resolved = resolveCommandInvocation([...registry.values()], rawName);
  const command = resolved ? registry.get(resolved.commandName) : undefined;

  if (
    command &&
    command.availability !== "hidden" &&
    command.enabled !== false
  ) {
    if (context.interactive === false && command.supportsNonInteractive !== true) {
      return {
        kind: "local",
        output: [
          "Result",
          "- Outcome: blocked",
          "- BlockerKind: command-not-allowlisted",
          `- Reason: ${command.nonInteractiveReason ?? `/${command.name} does not support non-interactive mode.`}`,
          "- DoNext: Run this command in an interactive session or use /help for supported commands.",
        ].join("\n"),
      };
    }
    let args: string[];
    try {
      args = resolved!.argumentMode === "raw"
        ? (rawCommandArgs ? [rawCommandArgs] : [])
        : tokenizeCommandArgs(rawCommandArgs);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { kind: "local", output: `Invalid /${rawName} arguments: ${error.message}` };
    }
    return command.execute(args, {
      ...context,
      rawCommandName: resolved!.name,
      rawCommandArgs,
    });
  }

  const extension = resolveCommandInvocation(dynamic, rawName);
  const handler = dynamic.find(entry => entry.name === extension?.commandName);
  if (handler) {
    let args: string[];
    try { args = tokenizeCommandArgs(rawCommandArgs); }
    catch { return { kind: 'local', output: 'Invalid extension command arguments.' }; }
    return handler.execute(args, { ...context, rawCommandName: rawName, rawCommandArgs });
  }

  return {
    kind: "local",
    output: buildUnknownSlashOutput(rawName, registry),
  };
}

function buildUnknownSlashOutput(
  rawName: string,
  registry: ReadonlyMap<string, CommandDefinition>,
): string {
  const uniqueHints = [...registry.values()].flatMap(commandInvocations)
    .filter(invocation => invocation.name.startsWith(rawName.toLowerCase()))
    .map(invocation => invocation.name);
  const hintLine =
    uniqueHints.length > 0
      ? `Did you mean: ${uniqueHints
          .slice(0, 3)
          .map((name) => `/${name}`)
          .join(", ")}?`
      : `Try /help to view grouped commands.`;

  return [
    "Result",
    "- Outcome: blocked",
    "- BlockerKind: command-not-allowlisted",
    `- Reason: Unknown slash command: /${rawName}`,
    "- DoNext: Use /help to view available commands and retry with a supported slash command.",
    "",
    `Unknown slash command: /${rawName}`,
    hintLine,
    "",
    ...buildSlashDiscoveryLines(),
  ].join("\n");
}

function buildSlashDiscoveryMessage(): string {
  return [
    "Result",
    "- Outcome: blocked",
    "- BlockerKind: command-not-allowlisted",
    `- Reason: Slash command required after '/'.`,
    "- DoNext: Enter a valid slash command such as /help or /resume.",
    "",
    `Slash command required after '/'.`,
    `Try /help to view grouped commands.`,
    "",
    ...buildSlashDiscoveryLines(),
  ].join("\n");
}

function buildSlashDiscoveryLines(): string[] {
  return [
    "Quick actions:",
    "- /resume                view sessions, or continue recoverable work",
    "- /workspace status      confirm current project/workdir binding",
    "- /diagnose              inspect repo status and suggested next step",
  ];
}
