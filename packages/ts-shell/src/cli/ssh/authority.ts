import { collaborationHosts } from '../collaboration/state.js';
import { collaborationAdmissionFor } from '../collaboration/policy.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { sameValue } from '../../config/values.js';
import type { SshComposition } from './model.js';
import { configurationAdmission } from '../../core/shell/configuration.js';

export const sshAuthority = { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'Exact separately approved SSH operation, including remote journal observations' } as const;

export { captureOrigin } from '../jobs/origin.js';
export function operationAdmission(host: SshComposition, bindProfile = true, bindWork = true, bindPending = true): () => string | undefined {
  const scope = host.jobs.scope(); const profile = host.profile;
  const collab = bindWork ? collaborationAdmissionFor(host.context) : () => undefined;
  const pending = bindPending ? host.pending?.signal : undefined;
  const cancellationRevision = bindPending ? host.cancellationRevision : undefined;
  const configuration = configurationAdmission(host.context); const capability = host.gate('ssh').admission;
  const goal = bindWork ? readGoalEdit(host.manager, host.context.session).goal : undefined;
  const acceptance = bindWork ? collaborationHosts.get(host.context)?.active : undefined;
  return () => {
    try {
      if (pending?.aborted || bindPending && (host.closing || cancellationRevision !== host.cancellationRevision))
        return 'SSH operation was cancelled locally; remote outcome remains separate.';
      const blocked = configuration() ?? capability?.() ?? collab(); if (blocked) return blocked;
      if (!sameValue(host.jobs.scope(), scope) || bindProfile && host.profile !== profile) return 'SSH session, workspace or profile changed.';
      if (bindWork) {
        const current = readGoalEdit(host.manager, host.context.session).goal;
        if (current?.id !== goal?.id || current?.phase !== goal?.phase || current?.controlRevision !== goal?.controlRevision
          || collaborationHosts.get(host.context)?.active !== acceptance) return 'SSH parent goal or remote acceptance changed.';
      }
      if (bindProfile) profile?.check(); return undefined;
    } catch { return 'SSH authority or source is unavailable or changed.'; }
  };
}
