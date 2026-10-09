import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { TurnCheckpointHandler } from '../../turn/checkpoint.js';
import { AdvisorRuntime } from '../../advisor/runtime.js';
import { runAdvisorCommand } from '../../advisor/command.js';
import { delegatedTarget } from '../provider/target.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { readAdvisor, writeAdvisor } from '../../advisor/store.js';
import type { BoundSessionHost } from '../../session/store/bound.js';

const runtimes = new WeakMap<ShellRuntimeContext, AdvisorRuntime>();

export function advisorFor(context: ShellRuntimeContext, store: SessionManager, renderer: Pick<StreamingRenderer, 'renderLine'>): AdvisorRuntime {
  let advisor = runtimes.get(context);
  if (!advisor) {
    advisor = new AdvisorRuntime({ store, current: () => context.session, report: message => renderer.renderLine(message), validateTarget: target => {
      const config = context.configuration.current.config;
      const main = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
      const selected = delegatedTarget(target, main, config);
      if (selected.provider === main.provider && selected.model === main.model) throw new Error('Advisor requires an independent model.');
    } });
    runtimes.set(context, advisor);
  }
  return advisor;
}
export function advisorCommandFor(context: ShellRuntimeContext, store: SessionManager, runtime: ShellSessionRuntime,
  renderer: Pick<StreamingRenderer, 'renderLine'>): NonNullable<CommandContext['advisorCommand']> {
  return async (args, commandContext) => {
    if (commandContext.sessionId !== context.session.id || commandContext.projectRoot !== context.projectRoot) return { kind: 'local', output: 'Advisor refused: the current session changed.' };
    return runAdvisorCommand(args, commandContext, advisorFor(context, store, renderer), runtime.getCurrentRunController() !== null);
  };
}
export function advisorCheckpointFor(context: ShellRuntimeContext, store: SessionManager, renderer: Pick<StreamingRenderer, 'renderLine'>,
  sourcePromptEntryId?: string): TurnCheckpointHandler {
  return async (checkpoint, runner, signal) => {
    if (!sourcePromptEntryId) return;
    await advisorFor(context, store, renderer).capture({ ...checkpoint, sourcePromptEntryId }, runner, signal);
  };
}
export function pauseAdvisor(context: ShellRuntimeContext, store: BoundSessionHost): void {
  try {
    const runtime = runtimes.get(context); if (runtime) { runtime.pause(); return; }
    const edit = readAdvisor(store, context.session);
    if (edit.advisor.enabled) writeAdvisor(store, context.session, edit,
      { ...edit.advisor, epoch: edit.advisor.epoch + 1, status: 'paused' });
  } catch { /* Unavailable advisor state cannot admit or publish advice. */ }
}
export function isAdvisorControl(text: string): boolean { return /^\/advisor(?:\s+(?:status|dump|off|on|configure)(?:\s|$)|\s*$)/i.test(text.trim()); }
