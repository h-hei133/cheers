import type { CommandContext } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { DirectorStore } from '../../workflow/director/store.js';
import { directorPolicy } from '../../workflow/director/policy.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { ModelAdmissionError } from '../../core/agent/request/model.js';
import { jobsFor } from './jobs.js';
import { runDirectorCommand } from '../director/command.js';
import { liveDirectors } from '../director/state.js';
import { workerEffects } from '../director/effects.js';
import { workerObservations } from '../director/observation.js';

export function directorCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['directorCommand']> {
  return async (args, command) => {
    const host = jobsFor(context);
    return host && command.sessionId === host.session.id && command.cwd === context.cwd ? runDirectorCommand(host, args, command)
      : { kind: 'local', output: 'Director requires the current bound session runtime.' };
  };
}
export function directorRunFor(context: ShellRuntimeContext, manager: SessionManager, parentAdmission: () => string | undefined) {
  const row = new DirectorStore(manager, context.session).read().cycles.find(cycle => !cycle.retired && cycle.phase !== 'disabled');
  if (!row) return undefined;
  const owner = liveDirectors.get(context);
  if (!owner || owner.row.id !== row.id || owner.admission()) throw new Error('The director has no adoptable selection. Inspect /director status and use off/on explicitly.');
  const admission = () => parentAdmission() ?? owner.admission();
  const bound = readBoundSessionState(manager, context.session);
  const scope = { id: context.session.id, workspacePath: bound.scope.workspace.path, workspaceIdentity: bound.scope.workspace.identity };
  return { admission, config: owner.config, featureTools: [...workerEffects(owner), ...workerObservations(owner)],
    policy: (policy: Parameters<typeof directorPolicy>[0]) => directorPolicy(policy ?? createRequestPolicy(sessionRequestStore(manager, context.session,
      scope, () => { if (admission()) throw new ModelAdmissionError('inactive'); return {}; }), scope.id), row.id),
    contextText: `Director ${row.id}: coordinate explicit workers. Your visible tools permit reading and worker management. Workers keep the original session tool restrictions and require independent effect approvals. Follow-ups must wait for a settled checkpoint. Preserve all original constraints and accepted input order. Worker output and completion are not goal verification.` };
}
export function directorInspectionFor(context: ShellRuntimeContext) {
  const owner = liveDirectors.get(context);
  return owner && !owner.admission() ? { config: owner.config(context.configuration.current.config),
    tools: [...workerEffects(owner), ...workerObservations(owner)] } : undefined;
}
export async function closeDirectorFor(context: ShellRuntimeContext): Promise<void> { await liveDirectors.get(context)?.close(); }
export function cancelDirectorFor(context: ShellRuntimeContext): void { void closeDirectorFor(context).catch(() => {}); }
export function directorInterruptible(context: ShellRuntimeContext): boolean { return liveDirectors.has(context); }
export function directorControl(text: string): boolean { return /^\/director(?:\s|$)/i.test(text.trim()); }
