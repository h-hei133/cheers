import { configurationAdmission } from '../../core/shell/configuration.js';
import { collaborationAdmissionFor } from '../collaboration/policy.js';
import { collaborationHosts } from '../collaboration/state.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import type { JobsComposition } from './model.js';
import { jobsInstallations } from './state.js';

export function jobAdmission(host: Pick<JobsComposition, 'context' | 'manager' | 'session' | 'gate'>, tool = 'bash'): () => string | undefined {
  const lifetime = jobsInstallations.get(host.context);
  const configuration = configurationAdmission(host.context); const collaboration = collaborationAdmissionFor(host.context);
  const acceptance = collaborationHosts.get(host.context)?.active;
  const goal = readGoalEdit(host.manager, host.session).goal; const gate = host.gate(tool).admission;
  const cwd = host.context.cwd;
  return () => {
    try {
      if (!lifetime || lifetime.closing || jobsInstallations.get(host.context) !== lifetime) return 'The local job runtime has closed or changed.';
      if (host.context.session.id !== host.session.id || host.context.cwd !== cwd) return 'The owning job session or directory is no longer active.';
      const blocked = configuration() ?? collaboration() ?? gate?.(); if (blocked) return blocked;
      const current = readGoalEdit(host.manager, host.session).goal;
      if (current?.id !== goal?.id || current?.phase !== goal?.phase || current?.controlRevision !== goal?.controlRevision
        || collaborationHosts.get(host.context)?.active !== acceptance) return 'The job parent changed or was revoked.';
      return undefined;
    } catch { return 'Local job admission is unavailable.'; }
  };
}
