import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { TurnCheckpointHandler } from '../../turn/checkpoint.js';
import { AdvisorRuntime } from '../../advisor/runtime.js';
import { runAdvisorCommand } from '../../advisor/command.js';
import { resolveAdvisorSelection } from '../provider/advisor.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { readAdvisor, writeAdvisor } from '../../advisor/store.js';
import type { BoundSessionHost } from '../../session/store/bound.js';
import { readSessionModelEdit } from '../../session/model/state.js';
import { projectModelSelection } from '../../session/model/projection.js';

const runtimes = new WeakMap<ShellRuntimeContext, AdvisorRuntime>();

export function advisorFor(context: ShellRuntimeContext, store: SessionManager, renderer: Pick<StreamingRenderer, 'renderLine'>): AdvisorRuntime {
  let advisor = runtimes.get(context);
  if (!advisor) {
    advisor = new AdvisorRuntime({ store, current: () => context.session, report: message => renderer.renderLine(message), resolveTarget: target => {
      const publication = context.configuration.current;
      if (publication.admissionBlocked) throw new Error('Advisor configuration is unavailable.');
      const edit = readSessionModelEdit(context.session.id);
      const config = projectModelSelection(publication.config, edit.selection);
      const main = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
      return resolveAdvisorSelection({ target, config, catalog: publication.catalog, main,
        revision: JSON.stringify([publication.revision, edit.revision]) });
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
  const publication = context.configuration.current;
  const sessionId = context.session.id;
  const modelRevision = readSessionModelEdit(sessionId).revision;
  const admission = (): string | undefined => {
    try {
      if (context.session.id === sessionId && context.configuration.current === publication
        && readSessionModelEdit(sessionId).revision === modelRevision) return undefined;
    } catch { /* An unreadable binding cannot authorize the captured provider closure. */ }
    return 'Advisor runner configuration changed; run a new turn before reviewing.';
  };
  return async (checkpoint, runner, signal) => {
    if (!sourcePromptEntryId) return;
    if (admission()) {
      if (advisorFor(context, store, renderer).view().enabled) renderer.renderLine('Advisor checkpoint skipped because its request configuration changed. Review resumes on a fresh turn.');
      return;
    }
    await advisorFor(context, store, renderer).capture({ ...checkpoint, sourcePromptEntryId }, input => {
      const blocked = admission();
      if (blocked) return Promise.resolve({ text: '', failed: true, failure: blocked, steps: 0, allowedTools: [] });
      return runner({ ...input, admission: () => input.admission?.() ?? admission() });
    }, signal);
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
