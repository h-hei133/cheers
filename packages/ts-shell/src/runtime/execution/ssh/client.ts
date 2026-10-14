import { createHash } from 'node:crypto';
import type { ExecutionAuthority } from '../types.js';
import { SshTransport } from './transport.js';
import { requireSsh, type SshWorkspace, type SshJobSpec } from './model.js';
import { workspaceProbe } from './remote/workspace.js';
import { startRemoteJob } from './remote/start.js';
import { queryRemoteJob, readRemoteOutput, observationFields } from './remote/query.js';
import { cancelRemoteJob } from './remote/cancel.js';
import { parseRemoteFrame, decoded } from './remote/protocol.js';
import { validateWorkspace } from './validation.js';
import { utf8PageEnd } from '../../../core/text/utf8.js';

export interface RemoteObservation {
  readonly invocationId?: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  readonly exitCode?: number;
  readonly output: 'complete' | 'interrupted' | 'unknown';
  readonly cancellation?: 'selected-cgroup-empty';
}
export class SshClient {
  constructor(readonly transport: SshTransport) {}
  async connect(scope: unknown, authority: ExecutionAuthority, signal?: AbortSignal): Promise<SshWorkspace> {
    const profile = this.transport.profile;
    const value = await this.request(workspaceProbe(profile.selection.workspace), ['root', 'identity', 'uid', 'boot', 'manager', 'cgroup'], authority, signal);
    requireSsh(value.manager === 'systemd-user' && value.cgroup === 'v2', 'unavailable');
    const binding = { profileIdentity: profile.identity, fingerprint: profile.fingerprint, root: decoded(value.root!, 4096).toString('utf8'),
      directoryIdentity: value.identity!, uid: Number(value.uid), bootId: value.boot!,
      namespace: createHash('sha256').update(JSON.stringify([scope, profile.identity, value.root, value.identity, value.boot])).digest('hex').slice(0, 32) };
    validateWorkspace(binding); return Object.freeze(binding);
  }
  async start(job: SshJobSpec, authority: ExecutionAuthority, signal?: AbortSignal): Promise<string> {
    this.check(job.binding); const value = await this.request(startRemoteJob(job), ['id', 'digest', 'invocation', 'status'], authority, signal);
    requireSsh(value.id === job.id && value.digest === job.digest && value.status === 'started' && /^[0-9a-f]{32}$/.test(value.invocation!), 'protocol');
    return value.invocation!;
  }
  async query(job: SshJobSpec, invocation: string | undefined, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteObservation> {
    this.check(job.binding);
    const value = await this.request(queryRemoteJob(job, invocation), observationFields, authority, signal);
    requireSsh(value.id === job.id && value.digest === job.digest && (value.invocation === 'unknown' || /^[0-9a-f]{32}$/.test(value.invocation!))
      && ['unknown', 'complete', 'interrupted'].includes(value.output!) && ['none', 'selected-cgroup-empty'].includes(value.cancel!)
      && ['unknown', 'selected-cgroup-empty'].includes(value.cleanup!) && ['unknown', 'exit', 'signal'].includes(value.termination!), 'protocol');
    const identity = value.invocation === 'unknown' ? undefined : value.invocation;
    if (value.cancel === 'selected-cgroup-empty') { requireSsh(identity, 'protocol'); return { invocationId: identity, status: 'cancelled', output: 'interrupted', cancellation: 'selected-cgroup-empty' }; }
    if (value.active === 'active' && (value.sub === 'running' || value.cleanup === 'unknown')) return { invocationId: identity, status: 'running', output: 'unknown' };
    const terminal = value.sub === 'exited' || value.active === 'failed';
    const code = Number(value.code); requireSsh(!terminal || (identity && Number.isInteger(code) && code >= 0 && code <= 255), 'protocol');
    if (!terminal || value.cleanup === 'unknown') return { invocationId: identity, status: 'unknown', output: 'unknown' };
    return { invocationId: identity, status: value.result === 'success' && value.termination === 'exit' && code === 0 && value.output === 'complete' ? 'completed' : 'failed',
      ...(value.termination === 'exit' ? { exitCode: code } : {}), output: value.output as RemoteObservation['output'] };
  }
  async cancel(job: SshJobSpec, invocation: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteObservation> {
    this.check(job.binding);
    const value = await this.request(cancelRemoteJob(job, invocation), ['id', 'digest', 'invocation', 'cancel', 'output'], authority, signal);
    requireSsh(value.id === job.id && value.digest === job.digest && value.invocation === invocation
      && value.cancel === 'selected-cgroup-empty' && value.output === 'interrupted', 'protocol');
    return { invocationId: invocation, status: 'cancelled', output: 'interrupted', cancellation: 'selected-cgroup-empty' };
  }
  async output(job: SshJobSpec, stream: 'stdout' | 'stderr', offset: number, authority: ExecutionAuthority, signal?: AbortSignal) {
    this.check(job.binding);
    const value = await this.request(readRemoteOutput(job, stream, offset), ['id', 'stream', 'offset', 'next', 'size', 'dropped', 'context'], authority, signal);
    const context = decoded(value.context!, 65536);
    const size = Number(value.size); const reportedNext = Number(value.next);
    requireSsh(value.id === job.id && value.stream === stream && value.offset === String(offset) && reportedNext === Math.min(size, offset + 16384)
      && Number.isInteger(size) && size >= 0 && size <= 65536 && reportedNext <= size && context.length === size
      && Number.isSafeInteger(offset) && offset >= 0 && offset <= reportedNext
      && (value.dropped === 'unknown' || /^[0-9]{1,20}$/.test(value.dropped!)), 'protocol');
    const nextOffset = utf8PageEnd(context, offset, 16384);
    return { bytes: context.subarray(offset, nextOffset), context, nextOffset, size,
      truncated: value.dropped === 'unknown' ? 'unknown' as const : BigInt(value.dropped!) > 0n };
  }
  private check(binding: SshWorkspace): void { validateWorkspace(binding); requireSsh(binding.profileIdentity === this.transport.profile.identity, 'changed'); this.transport.profile.check(); }
  private async request(script: string, fields: readonly string[], authority: ExecutionAuthority, signal?: AbortSignal) {
    const result = await this.transport.run(script, authority, signal);
    requireSsh(!result.outputLimited, 'output-limit'); requireSsh(result.cleanup === 'complete', 'cleanup');
    requireSsh(result.transport.status === 'completed' && result.transport.exitCode === 0, 'transport');
    return parseRemoteFrame(result.stdout, fields);
  }
}
