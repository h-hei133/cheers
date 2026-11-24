import type { CommandHookConfig, HookDecision, InProcessHookConfig, StopPayload } from '../types.js';
import { captureWorkspaceRoot } from '../../workspace/roots.js';
import { resolveCompletionHookCommand } from '../artifact.js';
import { STOP_TIMEOUT_MS, type ArchitectureCheck, type StopCheck, type StopDispatchOptions } from './model.js';
import { normalizeStopResult, stopCheck, stopUnknown } from './result.js';
import { boundedStopOperation, runStopCommand } from './run.js';

/** Stop is a consuming lifecycle; other event policies remain in their original dispatcher. */
export async function dispatchStop(input: {
  readonly payload: StopPayload;
  readonly inProcess: readonly InProcessHookConfig[];
  readonly commands: readonly CommandHookConfig[];
  readonly current: () => boolean;
  readonly sourceRevision: (hook: CommandHookConfig) => string | undefined;
  readonly allowed: (hook: CommandHookConfig, sourceRevision: string | undefined, active: () => boolean) => Promise<boolean>;
  readonly options: StopDispatchOptions;
}): Promise<HookDecision> {
  const checks: StopCheck[] = [];
  let unproven: HookDecision | undefined;
  const { payload, options } = input;
  const accept = (identity: string, result: HookDecision, started: number, architecture?: ArchitectureCheck): HookDecision => {
    const check = { ...stopCheck(identity, result, Date.now() - started), ...(architecture ? { architecture } : {}) };
    if (result.stopDisposition === 'completed_unproven') unproven ??= result;
    checks.push(check);
    options.onResult?.(check);
    return { ...result, stopChecks: [...checks] };
  };
  for (const hook of input.inProcess.filter(hook => hook.event === 'Stop')) {
    const started = Date.now();
    const result = await boundedStopOperation(async () => input.current()
      ? normalizeStopResult(await hook.handler(Object.freeze({ ...payload }))) : stopUnknown('registration_changed'),
      hook.timeoutMs ?? STOP_TIMEOUT_MS, options.signal);
    const decision = accept(`in-process:${hook.name ?? 'unnamed'}`, input.current() ? result : stopUnknown('registration_changed'), started);
    if (decision.decision !== 'allow') return decision;
  }
  for (const hook of input.commands.filter(hook => hook.event === 'Stop')) {
    const started = Date.now();
    const timeoutMs = hook.timeoutMs ?? STOP_TIMEOUT_MS;
    const revision = input.sourceRevision(hook);
    const current = () => input.current() && (hook.sourceCurrent?.() ?? true) && input.sourceRevision(hook) === revision;
    let active = true;
    const admission = await boundedStopOperation(async () => current()
      && await input.allowed(hook, revision, () => active && !options.signal?.aborted && current()) && current()
      ? { decision: 'allow' } : stopUnknown('not_authorized'), timeoutMs, options.signal);
    active = false;
    let result: HookDecision;
    let architecture: ArchitectureCheck | undefined;
    if (admission.decision !== 'allow') {
      result = admission;
    } else if (hook.completionGate !== undefined) {
      const assertCurrent = () => {
        if (!current()) throw new Error('The hook declaration changed.');
      };
      const prepared = await resolveCompletionHookCommand(hook.completionGate, payload.workspaceRoot, assertCurrent, options.signal);
      if ('decision' in prepared) result = prepared;
      else if (!current()) result = stopUnknown('registration_changed');
      else {
        const workspace = prepared.bundledPath && architectureWorkspace(payload.workspaceRoot);
        result = await runStopCommand(prepared.command, payload, timeoutMs, options.signal,
          [process.execPath, ...(prepared.bundledPath ? [prepared.bundledPath] : [])]).catch(() => stopUnknown('process_failed'));
        if (prepared.bundledPath && (!workspace || architectureWorkspace(payload.workspaceRoot) !== workspace)) {
          result = stopUnknown('registration_changed');
        } else if (workspace && result.decision === 'allow') {
          const verdict = result.reasonCode === 'proven' && result.proofVerdict === 'proven' ? 'proven'
            : result.reasonCode === 'advisory_only' && result.proofVerdict === 'partial' ? 'partial' : undefined;
          if (verdict) architecture = { sessionId: payload.sessionId, workspaceIdentity: workspace, verdict };
        }
      }
    } else {
      result = await runStopCommand(hook.command, payload, timeoutMs, options.signal).catch(() => stopUnknown('process_failed'));
    }
    const decision = current() ? accept(hook.command, result, started, architecture)
      : accept(hook.command, stopUnknown('registration_changed'), started);
    if (decision.decision !== 'allow') return decision;
  }
  return { ...(unproven ?? { decision: 'allow', reasonCode: checks.length ? 'explicit_allow' : 'not_configured' }), stopChecks: checks };
}

function architectureWorkspace(root: string): string | undefined {
  try { return captureWorkspaceRoot(root, root, 'read').identity; }
  catch { return undefined; }
}
