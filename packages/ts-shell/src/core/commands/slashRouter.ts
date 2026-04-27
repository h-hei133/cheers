import { createCommandRegistry } from './registry.js'
import type { CommandContext, CommandExecutionResult } from './types.js'

export async function routeSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandExecutionResult | null> {
  if (!input.startsWith('/')) {
    return null
  }

  const [rawName, ...args] = input.slice(1).split(/\s+/).filter(Boolean)
  if (!rawName) {
    return {
      kind: 'local',
      output: buildSlashDiscoveryMessage(),
    }
  }

  const registry = createCommandRegistry(context.cwd)
  const command =
    registry.get(rawName) ??
    Array.from(registry.values()).find(entry => entry.aliases?.includes(rawName))

  if (!command || command.availability === 'hidden' || command.enabled === false) {
    return {
      kind: 'local',
      output: buildUnknownSlashOutput(rawName, registry),
    }
  }

  return command.execute(args, context)
}

function buildUnknownSlashOutput(
  rawName: string,
  registry: ReadonlyMap<string, { aliases?: readonly string[] }>,
): string {
  const knownCommands = Array.from(registry.keys()).sort()
  const maybeMatches = knownCommands.filter((name) =>
    name.startsWith(rawName.toLowerCase()),
  )
  const aliasMatches = Array.from(registry.entries())
    .filter(([, entry]) =>
      (entry.aliases ?? []).some((alias) =>
        alias.startsWith(rawName.toLowerCase()),
      ),
    )
    .map(([name]) => name)

  const uniqueHints = Array.from(new Set([...maybeMatches, ...aliasMatches]))
  const hintLine =
    uniqueHints.length > 0
      ? `Did you mean: ${uniqueHints.slice(0, 3).map((name) => `/${name}`).join(', ')}?`
      : `Try /help to view grouped commands.`

  return [
    'Result',
    '- Outcome: blocked',
    '- BlockerKind: command-not-allowlisted',
    `- Reason: Unknown slash command: /${rawName}`,
    '- DoNext: Use /help to view available commands and retry with a supported slash command.',
    '',
    `Unknown slash command: /${rawName}`,
    hintLine,
    '',
    ...buildSlashDiscoveryLines(),
  ].join('\n')
}

function buildSlashDiscoveryMessage(): string {
  return [
    'Result',
    '- Outcome: blocked',
    '- BlockerKind: command-not-allowlisted',
    `- Reason: Slash command required after '/'.`,
    '- DoNext: Enter a valid slash command such as /help or /sessions.',
    '',
    `Slash command required after '/'.`,
    `Try /help to view grouped commands.`,
    '',
    ...buildSlashDiscoveryLines(),
  ].join('\n')
}

function buildSlashDiscoveryLines(): string[] {
  return [
    'Quick actions:',
    '- /sessions              view active session + recent sessions',
    '- /resume                continue best recoverable session context',
    '- /workspace status      confirm current project/workdir binding',
    '- /diagnose              inspect repo status and suggested next step',
  ]
}
