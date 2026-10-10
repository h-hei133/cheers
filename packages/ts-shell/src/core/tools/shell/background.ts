import { backgroundTasks } from '../../../workflow/jobs/local/legacy.js';
import { TaskRegistry } from '../../../workflow/jobs/local/registry.js';
import { renderTask } from '../../../workflow/jobs/local/projection.js';
import { ArtifactManager } from '../../session/artifactManager.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js';
import { approvedResult, deniedResult } from '../toolResultLifecycle.js';
import { planCommandLaunch } from './launch.js';
import { TOOL_APPROVED_COMMAND_AUTHORITY } from './authority.js';

/** Launch through the ordinary sandbox, returning a handle whose owner enforces its deadline. */
export function startBackgroundCommand(
  command: string,
  context: ToolExecutionContext,
  requestedTimeoutSeconds?: unknown,
): ToolExecutionResult {
  // Output past the in-memory limit goes beside this session's other artifacts,
  // so the file a reader is pointed at sits with the ones the foreground tools
  // write rather than in a directory of its own.
  if (!context.background) TaskRegistry.getShared().spillDirectory = ArtifactManager.getShared(
    context.workspaceRoot, context.sessionId,
  ).directory;
  if (!command.trim()) {
    return deniedResult('Error: No command provided to execute.', { status: 'failed', exitCode: 1 })
  }
  if (requestedTimeoutSeconds !== undefined && !context.background) {
    return deniedResult(
      'Error: a background command has no timeout, because nothing waits for it. Start it without one and stop it with taskStop.',
      { status: 'failed', exitCode: 1 },
    )
  }
  const timeoutMs = requestedTimeoutSeconds === undefined ? 300000 : Number(requestedTimeoutSeconds) * 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) return deniedResult('Local background deadline must be between 1 and 300 seconds.');
  const { sandbox } = planCommandLaunch(command, context)
  // Same refusal as the foreground path: a background command is not a way to
  // run something the sandbox declined to isolate.
  if (sandbox.state === 'refused') {
    return deniedResult(`Error: ${sandbox.notice ?? 'sandbox refused the command'}`, {
      status: 'failed',
      exitCode: 1,
    })
  }
  const task = (context.background ?? backgroundTasks).start({
    command,
    cwd: context.workspaceRoot,
    timeoutMs,
    authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    ...(sandbox.command && sandbox.args
      ? { shell: { command: sandbox.command, args: [...sandbox.args] } }
      : {}),
    ...(context.commandEnv ? { env: context.commandEnv } : {}),
  })
  if (task.failure) {
    return deniedResult(`Error: the command could not be started: ${task.failure}`, {
      status: 'failed',
      exitCode: 1,
    })
  }
  const isolation = sandbox.state === 'isolated'
    ? `\n[sandbox] ${sandbox.notice ?? 'Runs inside the workspace sandbox.'}`
    : sandbox.notice
      ? `\n[sandbox] ${sandbox.notice}`
      : ''
  return approvedResult(
    `Started ${task.id} in the background.\n${renderTask(task)}${isolation}\n\n` +
      `Read it with taskOutput, or stop it with taskStop. It keeps running if this turn ends.`,
  )
}

/** What a background command has produced, and whether it is still going. */
export function createTaskOutputToolDefinition(): ToolDefinition {
  return {
    name: 'taskOutput',
    description:
      'Read what a command started with runInBackground has produced. Reports whether it is still running and how it ended.',
    argsSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The identifier the background command was started under.' },
        all: { type: 'boolean', description: 'List running commands and the most recent 100 completions instead of one.' },
      },
    },
    async execute(args, context) {
      const background = context.background ?? backgroundTasks;
      if (args.all === true) {
        const tasks = background.list()
        if (tasks.length === 0) return approvedResult('No background commands have been started.')
        return approvedResult(tasks.map(renderTask).join('\n\n'))
      }
      const id = typeof args.taskId === 'string' ? args.taskId.trim() : ''
      if (!id) {
        return deniedResult('Error: give a taskId, or set all to list every background command.')
      }
      const task = background.get(id)
      if (!task) {
        return deniedResult(
          `Error: no background command named '${id}'. Known: ${background.list().map((t) => t.id).join(', ') || 'none'}.`,
        )
      }
      return approvedResult(renderTask(task))
    },
  }
}

/**
 * Stop a command that was started in the background.
 *
 * Refused rather than reported as success when nothing matched: a caller that
 * believes it stopped something and did not has a process still running under a
 * name it will not ask about again.
 */
export function createTaskStopToolDefinition(): ToolDefinition {
  return {
    name: 'taskStop',
    description: 'Stop a command started with runInBackground, by signalling its whole process group.',
    argsSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The identifier of the command to stop.' },
      },
      required: ['taskId'],
    },
    async execute(args, context) {
      const background = context.background ?? backgroundTasks;
      const id = typeof args.taskId === 'string' ? args.taskId.trim() : ''
      if (!id) return deniedResult('Error: taskStop needs a taskId.')
      const stopped = await background.stop(id)
      if (!stopped) {
        const task = background.get(id)
        return deniedResult(
          task
            ? `Error: ${id} is not running any more (${task.state}).`
            : `Error: no background command named '${id}'.`,
        )
      }
      return approvedResult(`Stop requested for ${id}. Check taskOutput for the observed result.`)
    },
  }
}
