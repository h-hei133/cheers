import type { ExecutionAuthority } from '../../runtime/execution/types.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { readSshProfile } from '../../runtime/execution/ssh/profile.js';
import { SshClient } from '../../runtime/execution/ssh/client.js';
import { SshTransport } from '../../runtime/execution/ssh/transport.js';
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js';
import { JobService, type RemoteJobBackend } from '../../workflow/jobs/service.js';
import type { SshComposition } from './model.js';
import { sshAuthority, connectedAdmission, operationAdmission } from './authority.js';
import { approveOperation } from './approval.js';
import { profilePreview } from './projection.js';
import { admittedOperation, releaseParentJobs } from './lifetime.js';
import { sshHosts } from './state.js';
import { sameValue } from '../../config/values.js';

export async function selectProfile(host: SshComposition, file: string): Promise<string> {
  const options = host.gate('ssh');
  const profile = readSshProfile(file, absolute => {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, options.permissionScope, options.workspaceRoot, options.denyRules);
    if (options.admission?.() || decision.denied) throw new Error('SSH source access refused.');
  });
  const admission = operationAdmission(host, false);
  const replaceAdmission = operationAdmission(host, false, true, false);
  return approveOperation(host, 'select profile', `${profilePreview(profile)}\nSelection reads the explicit private profile/key and verifies the native executable. Previously approved parent jobs are released through their exact cancellation capability before replacing the binding; detached jobs may continue.`, async context => {
    context.abortSignal?.throwIfAborted(); profile.check();
    return replaceBinding(host, context.abortSignal, replaceAdmission, released => {
      profile.check(); host.profile = profile;
      return { success: true, output: `SSH profile selected. ${released} Use /ssh connect to verify the remote workspace.`, metadata: { status: 'selected' } };
    });
  }, admission);
}
export async function connect(host: SshComposition, signal?: AbortSignal): Promise<string> {
  if (host.closing) throw new Error('SSH binding is closing.');
  if (!host.profile) throw new Error('No SSH profile selected.');
  const admission = connectedAdmission(host); const scope = host.jobs.scope();
  const replaceAdmission = operationAdmission(host, true, true, false);
  const transport = new SshTransport(createDefaultExecutionService(), host.profile, host.context.projectRoot,
    host.manager.getSessionDirPath(scope.sessionId));
  const client = new SshClient(transport);
  host.candidates.add(transport);
  try {
    const workspace = await admittedOperation(admission, signal, current => client.connect(scope, sshAuthority, current), host);
    if (admission()) throw new Error('SSH authority changed.');
    const prior = host.service;
    return await replaceBinding(host, signal, replaceAdmission, released => {
      transport.checkConnection();
      const valid = operationAdmission(host, true, false, false);
      const service: JobService = new JobService(host.jobs, backend(client), () => valid() ??
        (host.client !== client || host.service !== service || !sameValue(host.jobs.read().remote, workspace) ? 'SSH connection changed.' : undefined));
      host.jobs.connect(workspace); host.client = client; host.service = service;
      return 'SSH workspace verified and bound to a persistent connection. Remote commands, file reads and observations each require their own approval.' + (prior ? ' ' + released : '');
    });
  } catch (error) { await transport.close().catch(() => {}); throw error; }
  finally { host.candidates.delete(transport); }
}

export function disconnect(host: SshComposition, signal?: AbortSignal): Promise<string> {
  return replaceBinding(host, signal, () => undefined, released => {
    host.jobs.disconnect();
    return `Local SSH binding released. ${released} Detached or unknown jobs may still run remotely; retained IDs were not replayed.`;
  });
}

/** Freeze the original transport through cleanup and commit the new binding synchronously. */
async function replaceBinding<T>(host: SshComposition, signal: AbortSignal | undefined, admission: () => string | undefined,
  publish: (released: string) => T): Promise<T> {
  if (host.closing) throw new Error('SSH binding is closing.');
  const checkConnection = connectedAdmission(host, () => undefined);
  const scope = host.jobs.scope(); const transport = host.client?.transport;
  const check = () => {
    signal?.throwIfAborted();
    if (host.shutdown || sshHosts.get(host.context) !== host || !sameValue(scope, host.jobs.scope()) || admission())
      throw new Error('SSH binding changed.');
  };
  check();
  host.closing = true; host.retiringTransport = transport;
  try {
    const released = await releaseParentJobs(host);
    check(); if (checkConnection()) throw new Error('SSH connection changed.');
    host.client = undefined; host.service = undefined;
    await transport?.close();
    check();
    if (host.client || host.service) throw new Error('SSH connection changed.');
    return publish(released);
  } finally {
    host.retiringTransport = undefined;
    if (!host.shutdown) host.closing = false;
  }
}

export function backend(client: SshClient): RemoteJobBackend {
  return { identity: client.transport.profile.identity, check: () => {
      client.transport.profile.check();
      client.transport.checkConnection();
    },
    start: (job, authority: ExecutionAuthority, signal) => client.start(job, authority, signal),
    query: (job, invocation, authority: ExecutionAuthority, signal) => client.query(job, invocation, authority, signal),
    cancel: (job, invocation, authority: ExecutionAuthority, signal) => client.cancel(job, invocation, authority, signal),
    output: (job, stream, offset, authority: ExecutionAuthority, signal) => client.output(job, stream, offset, authority, signal) };
}
