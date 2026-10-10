import path from 'node:path';
import { sameValue } from '../../../config/values.js';
import { readBoundSessionState } from '../../../session/store/bound.js';
import { readWorkflow, type WorkflowFile } from '../../../core/workflow/definition.js';
import { projectTrust } from '../../../core/security/projectTrust.js';
import { loadHookDeclarations } from '../../../core/hooks/config.js';
import { createCoreToolRegistry } from '../../../core/tools/registry.js';
import { runPreparedTool } from '../../../turn/invoke.js';
import type { BackgroundInput, BackgroundRunner } from '../../../workflow/jobs/local/model.js';
import type { DagJob, DagRuntime } from '../../../workflow/jobs/dag/model.js';
import type { JobsComposition } from '../model.js';
import { jobAdmission } from '../authority.js';
import { evaluateToolPermissionScope } from '../../../core/query/toolPolicy.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';

export function workflowFileAccess(host: JobsComposition): (absolutePath: string) => void {
  const gate = host.gate('read');
  return absolute => {
    const refused = gate.admission?.(); if (refused) throw new Error(refused);
    const decision = evaluateToolPermissionScope('read', { path: absolute }, gate.permissionScope, gate.workspaceRoot, gate.denyRules);
    if (decision.denied) throw new Error(decision.reason);
  };
}

export function captureDagRuntime(host: JobsComposition, definition: WorkflowFile, expectedDirectory?: DagJob['directory']): DagRuntime {
  const parentAdmission = jobAdmission(host, 'bash'); const gate = host.gate('bash');
  const parent = readBoundSessionState(host.manager, host.session);
  const captured = captureWorkspaceRoot(host.context.cwd, parent.scope.workspace.path, 'read');
  const directory = expectedDirectory ?? { path: captured.path, identity: captured.identity };
  const name = path.basename(definition.source, '.json');
  const admission = () => {
    const refused = parentAdmission(); if (refused) return refused;
    try {
      const current = readBoundSessionState(host.manager, host.session);
      const cwd = captureWorkspaceRoot(host.context.cwd, parent.scope.workspace.path, 'read');
      if (cwd.path !== directory.path || cwd.identity !== directory.identity) return 'The approved workflow directory changed.';
      if (!sameValue(current.scope, parent.scope) || current.directoryIdentity !== parent.directoryIdentity
        || current.layout.sessionDir !== parent.layout.sessionDir) return 'The workflow session binding changed.';
      if (projectTrust.isProjectUntrusted(host.context.cwd) || host.runtime.getPermissionScope() !== gate.permissionScope
        || gate.agentMode !== undefined && host.runtime.getAgentMode() !== gate.agentMode) return 'Workflow permission, mode or trust changed.';
      const hooks = loadHookDeclarations(host.context.cwd);
      if (hooks.hooks.length || hooks.problems.length) return 'Workflow execution is unavailable with declared command hooks: their process cleanup cannot be verified. Use the main session.';
      const loaded = readWorkflow(host.context.cwd, name, workflowFileAccess(host));
      if ('error' in loaded || loaded.workflow.source !== definition.source || loaded.workflow.fingerprint !== definition.fingerprint)
        return 'The approved workflow definition changed or is unavailable.';
      return undefined;
    } catch { return 'Workflow admission is unavailable.'; }
  };
  return { directory, admission, runStep: async ({ job, step, signal }) => {
    const declared = job.definition.steps.find(entry => entry.id === step.id)!;
    let created = false; let stopFailed = false;
    const stop = () => { if (created) void host.registry.stop(step.jobId).catch(() => { stopFailed = true; }); };
    signal.addEventListener('abort', stop, { once: true });
    const background: BackgroundRunner = {
      start(input: BackgroundInput) {
        signal.throwIfAborted(); if (admission()) throw new Error('Workflow command admission changed.');
        if (input.command !== declared.run || input.timeoutMs !== declared.timeoutSeconds * 1000 || input.cwd !== host.context.cwd)
          throw new Error('The approved workflow command changed.');
        host.local.create(input, { id: step.jobId, origin: job.origin }); created = true;
        return host.registry.resume(step.jobId, input);
      },
      list: () => host.registry.list(), get: id => host.registry.get(id), stop: id => host.registry.stop(id), onEnded: host.registry.onEnded.bind(host.registry),
    };
    try {
      signal.throwIfAborted(); if (admission()) return 'cancelled';
      const result = await runPreparedTool(createCoreToolRegistry().get('bash')!, { command: declared.run, timeout: declared.timeoutSeconds, runInBackground: true },
        { ...gate, background, admission }, signal, step.jobId, `Workflow ${job.id} step ${step.id}`, { eventKey: 'workflow' });
      if (!created) return signal.aborted ? 'cancelled' : result.isError ? 'failed' : 'unknown';
      if (result.isError || signal.aborted) stop();
      await host.registry.settled(step.jobId);
      const child = host.local.get(step.jobId);
      if (result.metadata?.status === 'unverified' || stopFailed || child.status === 'unknown' || child.output === 'unknown' || host.registry.hasLive(step.jobId)
        || result.isError && child.status !== 'cancelled') return 'unknown';
      return ['completed', 'failed', 'cancelled'].includes(child.status) ? child.status as 'completed' | 'failed' | 'cancelled' : 'unknown';
    } finally {
      signal.removeEventListener('abort', stop);
      if (created && host.registry.hasLive(step.jobId)) {
        await host.registry.stop(step.jobId);
        await host.registry.settled(step.jobId);
      }
    }
  } };
}
