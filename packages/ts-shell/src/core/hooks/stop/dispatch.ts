import type { CommandHookConfig, HookDecision, InProcessHookConfig, StopPayload } from '../types.js';
import { STOP_TIMEOUT_MS, type StopCheck, type StopDispatchOptions } from './model.js';
import { normalizeStopResult, stopCheck, stopUnknown } from './result.js';
import { boundedStopOperation, runStopCommand } from './run.js';

/** Stop is a consuming lifecycle; other event policies remain in their original dispatcher. */
export async function dispatchStop(input: {
  readonly payload: StopPayload;
  readonly inProcess: readonly InProcessHookConfig[];
  readonly commands: readonly CommandHookConfig[];
  readonly current: () => boolean;
  readonly allowed: (hook: CommandHookConfig, active: () => boolean) => Promise<boolean>;
  readonly options: StopDispatchOptions;
}): Promise<HookDecision> {
  const checks: StopCheck[] = [];
  let unproven: HookDecision | undefined;
  const { payload, options } = input;
  const accept = (identity: string, result: HookDecision, started: number): HookDecision => {
    const check = stopCheck(identity, result, Date.now() - started);
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
    let active = true;
    const admission = await boundedStopOperation(async () => input.current() && await input.allowed(hook, () => active && !options.signal?.aborted)
      && input.current() ? { decision: 'allow' } : stopUnknown('not_authorized'), timeoutMs, options.signal);
    active = false;
    const result = admission.decision === 'allow'
      ? await runStopCommand(hook.command, payload, timeoutMs, options.signal).catch(() => stopUnknown('process_failed')) : admission;
    const decision = accept(hook.command, input.current() ? result : stopUnknown('registration_changed'), started);
    if (decision.decision !== 'allow') return decision;
  }
  return { ...(unproven ?? { decision: 'allow', reasonCode: checks.length ? 'explicit_allow' : 'not_configured' }), stopChecks: checks };
}
