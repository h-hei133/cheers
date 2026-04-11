import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { runDoctorCommand, runWorkflowStatusCommand } from './localCommandRuntime.js'
import { runResumePromptCommand } from './promptCommandRuntime.js'
import {
  runCancelShellAction,
  runHelpShellAction,
  runMcpShellAction,
  runSessionsShellAction,
} from './shellActionRuntime.js'
import type { CommandDefinition } from './types.js'

export function createCommandRegistry(cwd: string = process.cwd()): ReadonlyMap<string, CommandDefinition> {
  const runtimeConfig = getRuntimeConfig(cwd)
  const commands: CommandDefinition[] = [
    {
      name: 'doctor',
      kind: 'local',
      availability: 'available',
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runDoctorCommand(context),
    },
    {
      name: 'workflow-status',
      aliases: ['status'],
      kind: 'local',
      availability: 'available',
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runWorkflowStatusCommand(context),
    },
    {
      name: 'resume',
      kind: 'prompt',
      availability: 'available',
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runResumePromptCommand(args, context),
    },
    {
      name: 'cancel',
      kind: 'shell-action',
      availability: 'available',
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runCancelShellAction(args, context),
    },
    {
      name: 'sessions',
      kind: 'shell-action',
      availability: 'available',
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runSessionsShellAction(args, context),
    },
    {
      name: 'mcp',
      kind: 'shell-action',
      availability: runtimeConfig.enableMcpTools ? 'available' : 'hidden',
      enabled: runtimeConfig.enableMcpTools,
      bridgeSafe: true,
      execute: (args, context) => runMcpShellAction(args, context),
    },
    {
      name: 'help',
      aliases: ['?'],
      kind: 'shell-action',
      availability: 'available',
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runHelpShellAction(args, context),
    },
  ]

  return new Map(commands.map(command => [command.name, command]))
}

export function listVisibleCommands(cwd: string = process.cwd()): CommandDefinition[] {
  return Array.from(createCommandRegistry(cwd).values()).filter(
    command => command.availability !== 'hidden' && command.enabled !== false,
  )
}
