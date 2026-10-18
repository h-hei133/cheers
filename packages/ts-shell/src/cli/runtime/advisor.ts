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
import { accountPublicationMatches } from '../provider/publication.js';
import type { SubagentRunner } from '../../core/subagents/runner.js';
import type { AccountPublication } from '../../core/auth/account/contract.js';

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
  let publication = context.configuration.current;
  let publicationValid = true;
  const sessionId = context.session.id;
  const modelRevision = readSessionModelEdit(sessionId).revision;
  const admission = (): string | undefined => {
    try {
      if (publicationValid && context.session.id === sessionId && context.configuration.current === publication
        && readSessionModelEdit(sessionId).revision === modelRevision) return undefined;
    } catch { /* An unreadable binding cannot authorize the captured provider closure. */ }
    return 'Advisor runner configuration changed; run a new turn before reviewing.';
  };
  const accountPublication: AccountPublication = (rotation, publish) => {
    const before = context.configuration.current;
    const eligible = !admission() && before === publication;
    publicationValid = false;
    // Verified persistence is published even when this observer has become stale.
    const applied = publish();
    const after = context.configuration.current;
    if (eligible && rotation && applied === true && context.session.id === sessionId
      && readSessionModelEdit(sessionId).revision === modelRevision && accountPublicationMatches(before, after, rotation)) {
      publication = after;
      publicationValid = true;
    }
  };
  const handler: TurnCheckpointHandler = async (checkpoint, runner, signal) => {
    if (!sourcePromptEntryId) return;
    if (admission()) {
      if (advisorFor(context, store, renderer).view().enabled) renderer.renderLine('Advisor checkpoint skipped because its request configuration changed. Review resumes on a fresh turn.');
      return;
    }
    const bound: SubagentRunner = input => {
      const blocked = admission();
      if (blocked) return Promise.resolve({ text: '', failed: true, failure: blocked, steps: 0, allowedTools: [] });
      return runner({ ...input, admission: () => input.admission?.() ?? admission() });
    };
    const prepared = Object.assign(bound, { prepare: async (input: Parameters<NonNullable<SubagentRunner['prepare']>>[0]) => {
      const admit = () => input.signal?.aborted ? 'Advisor preparation cancelled.' : input.admission?.() ?? admission();
      const refusal = admit(); if (refusal) throw new Error(refusal);
      let active = true;
      try {
        await runner.prepare?.({ ...input, admission: admit, accountPublication: (rotation, publish) => {
          // Persistence already succeeded. Even a stale advisor must publish that storage outcome.
          if (active && !admit()) accountPublication(rotation, publish);
          else publish();
        } });
        const blocked = admit(); if (blocked) throw new Error(blocked);
      } finally { active = false; }
    } });
    await advisorFor(context, store, renderer).capture({ ...checkpoint, sourcePromptEntryId }, prepared, signal);
  };
  return Object.assign(handler, { accountPublication });
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
