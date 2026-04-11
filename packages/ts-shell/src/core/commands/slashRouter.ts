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
  const registry = createCommandRegistry(context.cwd)
  const command =
    registry.get(rawName) ??
    Array.from(registry.values()).find(entry => entry.aliases?.includes(rawName))

  if (!command || command.availability === 'hidden' || command.enabled === false) {
    return {
      kind: 'local',
      output: `Unknown slash command: /${rawName}`,
    }
  }

  return command.execute(args, context)
}
