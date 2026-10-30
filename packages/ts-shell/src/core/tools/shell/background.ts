import { backgroundTasks } from '../../../workflow/jobs/local/legacy.js';
import { TaskRegistry } from '../../../workflow/jobs/local/registry.js';
import { renderTask } from '../../../workflow/jobs/local/projection.js';
import { ArtifactManager } from '../../session/artifactManager.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js';
import { approvedResult, deniedResult } from '../toolResultLifecycle.js';
import { planCommandLaunch } from './launch.js';
import type { BackgroundRunner, BackgroundTask } from '../../../workflow/jobs/local/model.js';
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

/** Longest a single wait may block, matching the background deadline it watches. */
const WAIT_MAX_MS = 300_000;
type WaitOutcome =
  | { readonly kind: 'settled'; readonly task: BackgroundTask }
  | { readonly kind: 'cancelled' | 'timeout' };

/**
 * Wait for a background command to finish, instead of polling for it.
 *
 * A model that needs a command's result had two options and both were wrong:
 * `taskOutput` returns immediately whether or not anything has happened, so a
 * caller had to guess how long to sleep first, and `bash sleep` spends the
 * turn's own budget on the guess — and at sixty seconds the foreground command
 * is promoted to the background anyway, so the sleep outlives the thing it was
 * waiting for. This waits on the runner's own completion event, which fires
 * once, and returns the task as it settled.
 *
 * The wait is bounded and cancellable. A background command is allowed to run
 * past any single turn, so a wait that could not give up would make one slow
 * command unkillable from the model's side; when the deadline passes the answer
 * reports the current task state rather than pretending it finished.
 */
export function createTaskWaitToolDefinition(): ToolDefinition {
  return {
    name: 'taskWait',
    description:
      'Wait for a background command started with runInBackground to finish, then report its result. '
      + 'Prefer this over polling taskOutput or sleeping in bash.',
    argsSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The identifier the background command was started under.' },
        timeoutSeconds: {
          type: 'number',
          description: `How long to wait before reporting the current task state (default and maximum ${WAIT_MAX_MS / 1000}).`,
        },
      },
      required: ['taskId'],
    },
    async execute(args, context) {
      const background = context.background ?? backgroundTasks;
      const id = typeof args.taskId === 'string' ? args.taskId.trim() : '';
      if (!id) return deniedResult('Error: taskWait needs a taskId.');
      const requested = args.timeoutSeconds;
      const timeoutMs = typeof requested === 'number' && Number.isFinite(requested)
        ? Math.min(WAIT_MAX_MS, Math.max(1_000, Math.round(requested * 1000)))
        : WAIT_MAX_MS;
      const task = background.get(id);
      if (!task) {
        return deniedResult(`Error: no background command named '${id}'. Known: ${background.list().map(entry => entry.id).join(', ') || 'none'}.`);
      }
      // Already settled: the answer is the result, not a wait that returns at once.
      if (task.state === 'exited' || task.state === 'killed' || task.state === 'unknown') return approvedResult(renderTask(task));

      const outcome = await waitForSettlement(background, id, timeoutMs, context.abortSignal);
      if (outcome.kind === 'settled') return approvedResult(renderTask(outcome.task));
      const notice = outcome.kind === 'cancelled'
        ? 'Wait cancelled; no stop was requested.'
        : `Wait limit reached after ${Math.round(timeoutMs / 1000)}s; no stop was requested.`;
      const current = background.get(id);
      return approvedResult(`${notice}\n\n${current ? renderTask(current) : `${id}: current task state is unavailable.`}`);
    },
  };
}

/**
 * Settle when `id` ends, the deadline passes, or the turn is cancelled.
 *
 * The listener is always released: a wait that timed out and left its listener
 * attached would keep the runner calling into a tool call that no longer
 * exists, and a cancelled wait must not keep the turn open.
 */
function waitForSettlement(
  background: BackgroundRunner,
  id: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<WaitOutcome> {
  return new Promise(resolve => {
    let done = false;
    // Declared before anything can call `finish`: a runner that reports a
    // completion synchronously from `onEnded`, or a signal that is already
    // aborted, reaches the cleanup while these are still unassigned.
    let release: () => void = () => {};
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => finish({ kind: 'cancelled' });
    const finish = (outcome: WaitOutcome): void => {
      if (done) return;
      done = true;
      if (deadline !== undefined) clearTimeout(deadline);
      release();
      signal?.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    release = background.onEnded(ended => { if (ended.id === id) finish({ kind: 'settled', task: ended }); });
    // A synchronous completion ran cleanup before registration returned its
    // release capability. Retire it now and create no timers or abort listener.
    if (done) { release(); return; }
    deadline = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    // The task can end between the caller's `get` and this listener being
    // installed. `onEnded` only reports what happens after it is registered, so
    // without this recheck that gap would leave the wait sitting until its
    // deadline — five minutes of nothing for a command that already finished.
    const current = background.get(id);
    if (current && (current.state === 'exited' || current.state === 'killed' || current.state === 'unknown')) finish({ kind: 'settled', task: current });
  });
}
