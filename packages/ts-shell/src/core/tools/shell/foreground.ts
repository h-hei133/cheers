import { createCommandOutputCapture } from '../../../runtime/execution/output/capture.js';
import type { CommandExecutionResult, CommandExecutionRequest, ExecutionService } from '../../../runtime/execution/types.js';
import { resolveCommandTimeout, DEFAULT_COMMAND_TIMEOUT_MS } from '../../../runtime/execution/commandTimeout.js';
import { startCommandProof } from '../../../runtime/execution/proof.js';
import { networkNotice, readSandboxRules } from '../../../sandbox/osSandbox.js';
import type { ToolExecutionContext } from '../../../tools/types.js';
import { ArtifactManager } from '../../session/artifactManager.js';
import { approvedResult, deniedResult } from '../toolResultLifecycle.js';
import { TOOL_APPROVED_COMMAND_AUTHORITY } from './authority.js';
import { planCommandLaunch } from './launch.js';
import { commandOutputResult } from './output.js';

/** One execution and capture owner survive the foreground-to-job handoff. */
export async function runCommandTool(executionService: ExecutionService, command: string,
  context: ToolExecutionContext, requestedTimeoutSeconds?: unknown, options: { readonly combinedOutput?: boolean } = {}) {
  if (!command.trim()) return deniedResult('Error: No command provided to execute.', { status: 'failed', exitCode: 1 });
  const timeout = resolveCommandTimeout(requestedTimeoutSeconds);
  if (!timeout.ok) return deniedResult(`Error: ${timeout.reason}`, { status: 'failed', exitCode: 1 });
  const { shellBin, shellArgs, sandbox } = planCommandLaunch(command, context);
  if (sandbox.state === 'refused') return deniedResult(`Error: ${sandbox.notice ?? 'sandbox refused the command'}`, { status: 'failed', exitCode: 1 });

  const manager = ArtifactManager.getShared(context.artifactRoot ?? context.workspaceRoot, context.sessionId);
  const capture = createCommandOutputCapture({ openSpill: () => manager.createTextStaging(), combinedOutput: options.combinedOutput });
  const proof = startCommandProof(command, context);
  context.commandProof?.started(proof, context.assertSourceAccess);
  const promotable = requestedTimeoutSeconds === undefined && context.background?.adopt && context.background.promote
    && context.onOutput && executionService.startCommand;
  let foreground = true;
  let transferred = false;
  let projected = false;
  const request: CommandExecutionRequest = {
    operationKind: 'command.run', command: sandbox.command ?? shellBin, args: sandbox.args ?? shellArgs,
    cwd: context.workspaceRoot, workspaceRoot: context.workspaceRoot, authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    caller: 'core-tool:bash', reason: 'Run an approved workspace command.', reportSafeCommand: command,
    abortSignal: context.abortSignal, captureOutput: false,
    onStdout: bytes => capture.append('stdout', bytes), onStderr: bytes => capture.append('stderr', bytes),
    outputSnapshot: () => ({ stdout: capture.snapshot('stdout').tail, stderr: capture.snapshot('stderr').tail }),
    ...(context.commandEnv ? { env: context.commandEnv } : {}),
    ...(context.onOutput ? { onOutput: (text: string) => { if (foreground) context.onOutput?.(text); } } : {}),
    timeoutMs: promotable ? 300_000 : timeout.timeoutMs,
  };
  try {
    let result: CommandExecutionResult;
    if (promotable) {
      const started = executionService.startCommand!(request);
      let task;
      try {
        task = context.background!.adopt!(started.handle, { command, cwd: context.workspaceRoot, timeoutMs: 300_000,
          authority: TOOL_APPROVED_COMMAND_AUTHORITY, ...(context.commandEnv ? { env: context.commandEnv } : {}) }, capture);
      } catch (error) {
        const settled = started.result.catch(() => undefined);
        await started.handle.kill();
        await settled;
        throw error;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<{ kind: 'timeout' }>(resolve => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), DEFAULT_COMMAND_TIMEOUT_MS);
        timer.unref?.();
      });
      try {
        const promoted = context.background!.whenPromoted?.(task.id).then(outcome => ({ kind: 'promotion' as const, outcome }));
        const raced = await Promise.race([started.result.then(value => ({ kind: 'result' as const, value })), deadline,
          ...(promoted ? [promoted] : [])]);
        if (raced.kind === 'result') result = raced.value;
        else {
          const outcome = raced.kind === 'timeout' ? context.background!.promote!(task.id) : raced.outcome;
          if (outcome === 'promoted') {
            started.handle.detach();
            foreground = false;
            transferred = true;
            return approvedResult(`Moved to the background as ${task.id}${raced.kind === 'timeout' ? ` after ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds` : ''}. It keeps the same process; read it with taskOutput and stop it with taskStop.`);
          }
          if (outcome === 'refused') {
            foreground = false;
            transferred = true;
            await started.handle.kill();
            // The job owner retains native settlement; a dispatched kill is not
            // proof that all descendants have stopped.
            return deniedResult('Error: the command could not be moved to the background; process stop was requested.', { status: 'failed', exitCode: 1 });
          }
          result = await started.result;
        }
      } finally { clearTimeout(timer); }
    } else result = await executionService.runCommand(request);

    context.commandProof?.settled({ ...proof, settledAt: new Date().toISOString(), status: result.status, exitCode: result.exitCode }, context.assertSourceAccess);
    try { await capture.finish(!!result.outputFailed || result.status === 'cancelled' || result.status === 'timeout'); }
    catch { /* The bounded result reports incomplete output below. */ }
    const notices = [sandbox.notice, sandbox.state === 'isolated' ? networkNotice(readSandboxRules(context.workspaceRoot)) : undefined]
      .filter((notice): notice is string => !!notice);
    const output = await commandOutputResult(result, capture, manager, notices, options);
    projected = true;
    return output;
  } finally {
    if (!transferred && !projected) {
      try { await capture.finish(true); } catch { /* Preserve the original execution failure. */ }
      try { await capture.dispose(); } catch { /* No saved-output claim was made. */ }
    }
  }
}
