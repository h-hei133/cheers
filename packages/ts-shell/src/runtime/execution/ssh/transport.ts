import fs from 'node:fs';
import path from 'node:path';
import { fileIdentity, pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import { bindExecutionTarget, executionWorkspace } from '../binding.js';
import type { ExecutionService, CommandExecutionResult } from '../types.js';
import { requireSsh, SshError, type SshProfile } from './model.js';
import { knownHostLine, sshArguments } from './options.js';

export interface SshTransportResult {
  readonly transport: Omit<CommandExecutionResult, 'stdout' | 'stderr'>;
  readonly stdout: Buffer;
  readonly bytes: { readonly stdout: number; readonly stderr: number };
  readonly outputLimited: boolean;
  readonly cleanup: 'complete' | 'unknown';
}
/** A native SSH invocation is transport evidence; it never proves a remote job terminal state. */
export class SshTransport {
  private blocked = false;
  private readonly controllers = new Set<AbortController>();
  constructor(private readonly execution: Pick<ExecutionService, 'runCommand'>, readonly profile: SshProfile,
    private readonly localRoot: string, private readonly privateParent: string) {
    bindExecutionTarget(this, profile.selection, localRoot);
  }
  abort(): void { for (const controller of this.controllers) controller.abort(); }
  async run(script: string, authority: import('../types.js').ExecutionAuthority, signal?: AbortSignal): Promise<SshTransportResult> {
    try { return await this.perform(script, authority, signal); }
    catch (error) { throw error instanceof SshError ? error : new SshError(this.blocked ? 'cleanup' : 'transport'); }
  }
  private async perform(script: string, authority: import('../types.js').ExecutionAuthority, signal?: AbortSignal): Promise<SshTransportResult> {
    requireSsh(authority.mode === 'approved-for-write', 'denied');
    requireSsh(!this.blocked, 'cleanup'); requireSsh(this.controllers.size < 2, 'unavailable');
    requireSsh(Buffer.byteLength(script) <= 96 * 1024 && !script.includes('\0'));
    this.profile.check(); signal?.throwIfAborted();
    const root = executionWorkspace(this, this.profile.selection, this.localRoot);
    const parent = fs.lstatSync(this.privateParent); pathIdentity(this.privateParent);
    requireSsh(parent.isDirectory() && parent.uid === process.getuid?.() && (parent.mode & 0o022) === 0, 'denied');
    const directory = fs.mkdtempSync(path.join(this.privateParent, 'ssh-')); fs.chmodSync(directory, 0o700);
    const identity = fileIdentity(fs.lstatSync(directory)); const key = path.join(directory, 'identity'); const known = path.join(directory, 'known_hosts');
    const controller = new AbortController(); const abort = () => controller.abort(); let cleanup: 'complete' | 'unknown' = 'complete';
    let outputLimited = false; let stdoutBytes = 0; let stderrBytes = 0; const output: Buffer[] = [];
    let result: CommandExecutionResult | undefined; this.controllers.add(controller);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
    try {
      const keyContent = this.profile.keySnapshot(); const knownContent = knownHostLine(this.profile.selection);
      fs.writeFileSync(key, keyContent, { mode: 0o600, flag: 'wx' }); fs.writeFileSync(known, knownContent, { mode: 0o600, flag: 'wx' });
      this.profile.check(); controller.signal.throwIfAborted();
      requireSsh(fileIdentity(fs.lstatSync(this.privateParent)) === fileIdentity(parent)
        && fileIdentity(fs.lstatSync(directory)) === identity && readTextFile(key, 64 * 1024) === keyContent
        && readTextFile(known, 24 * 1024) === knownContent, 'changed');
      const receive = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        if (stream === 'stdout') stdoutBytes += chunk.length; else stderrBytes += chunk.length;
        if (stdoutBytes > 256 * 1024 || stderrBytes > 256 * 1024 || stdoutBytes + stderrBytes > 384 * 1024) {
          outputLimited = true; controller.abort(); return;
        }
        if (stream === 'stdout' && !outputLimited) output.push(Buffer.from(chunk));
      };
      result = await this.execution.runCommand({ operationKind: 'command.run', command: this.profile.selection.executable,
        args: sshArguments(this.profile.selection, key, known), cwd: root, workspaceRoot: root, authority, caller: 'ssh-transport',
        reason: 'Exact explicit remote operation through verified native SSH', reportSafeCommand: 'Verified SSH transport; remote effect outcome is separate',
        env: { PATH: '/usr/bin:/bin', HOME: directory, LC_ALL: 'C', SSH_ASKPASS_REQUIRE: 'never' },
        timeoutMs: 15_000, abortSignal: controller.signal, captureOutput: false, cleanupTreeOnExit: true,
        onStdout: chunk => receive(chunk, 'stdout'), onStderr: chunk => receive(chunk, 'stderr'),
        onStdin: input => { void input.write(Buffer.from(script)).then(() => input.end(), () => controller.abort()); } });
      if (result.terminationFailed) cleanup = 'unknown';
    } finally {
      this.controllers.delete(controller); signal?.removeEventListener('abort', abort);
      try {
        requireSsh(fileIdentity(fs.lstatSync(directory)) === identity, 'changed'); pathIdentity(directory);
        fs.rmSync(directory, { recursive: true });
      } catch { cleanup = 'unknown'; }
      if (cleanup === 'unknown') this.blocked = true;
    }
    if (!result) throw new SshError('transport');
    const { stdout: _stdout, stderr: _stderr, ...native } = result;
    return { transport: { ...native, receipt: { ...native.receipt, outputSummary: 'Native SSH transport output is retained only in the bounded remote owner.' } },
      stdout: Buffer.concat(output), bytes: { stdout: stdoutBytes, stderr: stderrBytes }, outputLimited, cleanup };
  }
}
