import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { ExecutionService } from '../../../runtime/execution/types.js';
import { freshInvocation, type freshExecutable } from './invocation.js';
import { checkSwitch, changeSwitch, readSwitch } from './store.js';
import { verifySwitchSession } from './admission.js';
import type { SwitchTicket } from './model.js';

export async function drainProfileSwitch(ticket: SwitchTicket, drain: () => Promise<void>): Promise<void> {
  try {
    ticket.checkSource();
    await drain();
    ticket.checkSource();
    changeSwitch(ticket.source, ticket.operation, current => {
      if (current.status !== 'prepared') throw new Error('Source retirement admission changed.');
      return { ...current, status: 'drained' };
    });
  } catch (error) {
    try { changeSwitch(ticket.source, ticket.operation, current => ({ ...current, status: 'unknown' })); }
    catch { /* Unverified cleanup must not launch or overwrite uncertain ownership. */ }
    throw error;
  }
}

/** Called only after surface restoration and the old resource drain actually settle. */
export async function launchProfileSwitch(ticket: SwitchTicket, input: {
  readonly executable: ReturnType<typeof freshExecutable>;
  readonly env: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly execution?: Pick<ExecutionService, 'runCommand'>;
}): Promise<{ readonly status: 'verified' | 'unknown'; readonly sessionId?: string }> {
  try {
    ticket.checkSource();
    if (input.signal?.aborted) throw new Error('Switch cancelled before dispatch.');
    let receipt = readSwitch(ticket.source, ticket.operation);
    if (!receipt || receipt.status !== 'drained') throw new Error('Source cleanup has not admitted dispatch.');
    const invocation = freshInvocation(receipt, input.executable, input.env);
    receipt = changeSwitch(ticket.source, ticket.operation, current => {
      if (input.signal?.aborted || current.status !== 'drained') throw new Error('Switch admission changed.');
      return { ...current, status: 'dispatched' };
    });
    checkSwitch(receipt);
    ticket.checkSource();
    const result = await (input.execution ?? createDefaultExecutionService()).runCommand({
      operationKind: 'command.run', ...invocation, cwd: receipt.plan.workingDirectory.path, workspaceRoot: receipt.plan.workspace.path,
      authority: { mode: 'none-required', source: 'none', reason: 'Explicitly confirmed CLI profile lifecycle handoff; no tool authority is transferred.' },
      caller: 'profile-switch', reason: 'Start the explicitly selected isolated profile after source cleanup.', reportSafeCommand: 'Start selected profile',
      inheritTerminal: true, captureOutput: false, cleanupTreeOnExit: true, abortSignal: input.signal,
      onStarted: pid => { changeSwitch(ticket.source, ticket.operation, current => {
        if (current.status === 'dispatched') return { ...current, childPid: pid };
        if (['admitting', 'admitted'].includes(current.status) && current.childPid === pid) return current;
        throw new Error('Child startup ownership changed.');
      }); },
    });
    const actual = readSwitch(ticket.source, ticket.operation);
    if (!actual || actual.status !== 'admitted' || result.status !== 'completed' || result.terminationFailed || result.outputFailed) throw new Error('Target startup or settlement is unverified.');
    verifySwitchSession(actual);
    return { status: 'verified', sessionId: actual.targetSessionId };
  } catch {
    try { changeSwitch(ticket.source, ticket.operation, current => current.status === 'admitted' ? current : { ...current, status: 'unknown' }); }
    catch { /* Uncertain ownership never authorizes cleanup or replay. */ }
    return { status: 'unknown' };
  }
}
