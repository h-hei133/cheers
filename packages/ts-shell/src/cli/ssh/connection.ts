import type { ExecutionAuthority } from '../../runtime/execution/types.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { readSshProfile } from '../../runtime/execution/ssh/profile.js';
import { SshClient } from '../../runtime/execution/ssh/client.js';
import { SshTransport } from '../../runtime/execution/ssh/transport.js';
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js';
import { JobService, type RemoteJobBackend } from '../../workflow/jobs/service.js';
import type { SshComposition } from './model.js';
import { sshAuthority, operationAdmission } from './authority.js';
import { approveOperation } from './approval.js';
import { profilePreview } from './projection.js';
import { admittedOperation, releaseParentJobs } from './lifetime.js';

export async function selectProfile(host: SshComposition, file: string): Promise<string> {
  const options = host.gate('ssh');
  const profile = readSshProfile(file, absolute => {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, options.permissionScope, options.workspaceRoot, options.denyRules);
    if (options.admission?.() || decision.denied) throw new Error('SSH source access refused.');
  });
  const admission = operationAdmission(host, false);
  return approveOperation(host, 'select profile', `${profilePreview(profile)}\nSelection reads the explicit private profile/key and verifies the native executable. Previously approved parent jobs are released through their exact cancellation capability before replacing the binding; detached jobs may continue.`, async context => {
    context.abortSignal?.throwIfAborted(); profile.check();
    const released = await releaseParentJobs(host); context.abortSignal?.throwIfAborted();
    if (admission()) throw new Error('SSH source authority changed.');
    host.client?.transport.abort(); host.profile = profile; host.client = undefined; host.service = undefined;
    return { success: true, output: `SSH profile selected. ${released} Use /ssh connect to verify the remote workspace.`, metadata: { status: 'selected' } };
  }, false);
}
export async function connect(host: SshComposition, signal?: AbortSignal): Promise<string> {
  if (!host.profile) throw new Error('No SSH profile selected.');
  const admission = operationAdmission(host); const scope = host.jobs.scope();
  const transport = new SshTransport(createDefaultExecutionService(), host.profile, host.context.projectRoot,
    host.manager.getSessionDirPath(scope.sessionId));
  const client = new SshClient(transport);
  try {
    const workspace = await admittedOperation(admission, signal, current => client.connect(scope, sshAuthority, current), host);
    if (admission()) throw new Error('SSH authority changed.');
    host.jobs.connect(workspace); host.client?.transport.abort(); host.client = client;
    host.service = new JobService(host.jobs, backend(client), operationAdmission(host, true, false, false));
    return 'SSH workspace verified and bound; remote commands and observations each require their own approval.';
  } catch (error) { transport.abort(); throw error; }
}
export function backend(client: SshClient): RemoteJobBackend {
  return { identity: client.transport.profile.identity, check: () => client.transport.profile.check(),
    start: (job, authority: ExecutionAuthority, signal) => client.start(job, authority, signal),
    query: (job, invocation, authority: ExecutionAuthority, signal) => client.query(job, invocation, authority, signal),
    cancel: (job, invocation, authority: ExecutionAuthority, signal) => client.cancel(job, invocation, authority, signal),
    output: (job, stream, offset, authority: ExecutionAuthority, signal) => client.output(job, stream, offset, authority, signal) };
}
