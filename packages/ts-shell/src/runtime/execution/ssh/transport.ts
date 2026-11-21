import { setTimeout as delay } from 'node:timers/promises';
import { bindExecutionTarget, executionWorkspace } from '../binding.js';
import type { CommandExecutionRequest, CommandExecutionResult, ExecutionAuthority, ExecutionService } from '../types.js';
import { SshDirectory } from './directory.js';
import { requireSsh, SshError, type SshProfile } from './model.js';
import { sshArguments } from './options.js';

export interface SshTransportResult {
  readonly transport: Omit<CommandExecutionResult, 'stdout' | 'stderr'>;
  readonly stdout: Buffer;
  readonly bytes: { readonly stdout: number; readonly stderr: number };
  readonly outputLimited: boolean;
  readonly cleanup: 'complete' | 'unknown';
}

interface Master {
  readonly directory: SshDirectory;
  readonly controller: AbortController;
  done: Promise<void>;
  socket?: string;
}

/** An approved foreground master owns all channels for one connection generation. */
export class SshTransport {
  private blocked = false;
  private closing?: Promise<void>;
  private master?: Master;
  private readonly active = new Map<AbortController, Promise<void>>();

  constructor(private readonly execution: Pick<ExecutionService, 'runCommand'>, readonly profile: SshProfile,
    private readonly localRoot: string, private readonly privateParent: string) {
    bindExecutionTarget(this, profile.selection, localRoot);
  }

  get connected(): boolean {
    return Boolean(this.master?.socket && !this.closing && !this.blocked);
  }

  checkConnection(): void {
    requireSsh(!this.blocked, 'cleanup');
    const master = this.master;
    requireSsh(master?.socket && this.connected, 'unavailable');
    try { requireSsh(master.directory.socketIdentity() === master.socket, 'changed'); }
    catch { void this.close().catch(() => {}); throw new SshError('changed'); }
  }

  abort(): void {
    for (const controller of this.active.keys()) controller.abort();
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    const master = this.master;
    this.closing = Promise.all([...this.active.values()]).then(async () => {
      if (master) {
        master.controller.abort();
        await master.done;
        try { master.directory.remove(); } catch { this.blocked = true; }
      }
      requireSsh(!this.blocked, 'cleanup');
    });
    if (!master?.socket) master?.controller.abort();
    this.abort();
    return this.closing;
  }

  async open(authority: ExecutionAuthority, signal?: AbortSignal): Promise<void> {
    requireSsh(authority.mode === 'approved-for-write', 'denied');
    requireSsh(!this.master && !this.closing, 'unavailable');
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const directory = new SshDirectory(this.privateParent);
      const master: Master = { directory, controller, done: Promise.resolve() };
      this.master = master;
      directory.stage(this.profile);
      this.profile.check();
      signal?.throwIfAborted();
      requireSsh(!this.closing, 'unavailable');
      master.done = this.execution.runCommand(this.request(master, 'master', authority, controller.signal)).then(
        result => this.masterEnded(master, Boolean(result.terminationFailed)),
        () => this.masterEnded(master, true),
      );
      const deadline = performance.now() + 8_000;
      do {
        if (controller.signal.aborted) throw new SshError('transport');
        const socket = directory.socketIdentity();
        if (socket) {
          directory.forgetCredentials();
          this.profile.check();
          signal?.throwIfAborted();
          requireSsh(!this.closing, 'unavailable');
          master.socket = socket;
          return;
        }
        await delay(20, undefined, { signal: controller.signal });
      } while (performance.now() < deadline);
      throw new SshError('transport');
    } catch (error) {
      await this.close();
      signal?.throwIfAborted();
      throw error instanceof SshError ? error : new SshError('transport');
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  async run(script: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<SshTransportResult> {
    requireSsh(authority.mode === 'approved-for-write', 'denied');
    requireSsh(this.active.size < 2, 'unavailable');
    requireSsh(Buffer.byteLength(script) <= 96 * 1024 && !script.includes('\0'));
    this.profile.check();
    signal?.throwIfAborted();
    this.checkConnection();
    const master = this.master!;
    const controller = new AbortController();
    const abort = () => controller.abort();
    let settle!: () => void;
    this.active.set(controller, new Promise<void>(resolve => { settle = resolve; }));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) controller.abort();
      controller.signal.throwIfAborted();
      const result = await runChannel(this.execution, this.request(master, 'channel', authority, controller.signal), script, controller);
      if (result.cleanup === 'unknown') {
        this.blocked = true;
        void this.close().catch(() => {});
      }
      return result;
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      throw error instanceof SshError ? error : new SshError(this.blocked ? 'cleanup' : 'transport');
    } finally {
      signal?.removeEventListener('abort', abort);
      this.active.delete(controller);
      settle();
    }
  }

  private masterEnded(master: Master, uncertain: boolean): void {
    if (uncertain) this.blocked = true;
    master.controller.abort();
    // Let the master's settlement resolve before the close continuation joins it.
    void this.close().catch(() => {});
  }

  private request(master: Master, mode: 'master' | 'channel', authority: ExecutionAuthority, abortSignal: AbortSignal): CommandExecutionRequest {
    return { operationKind: 'command.run', command: this.profile.selection.executable, args: sshArguments(this.profile.selection, mode),
      cwd: master.directory.path, workspaceRoot: executionWorkspace(this, this.profile.selection, this.localRoot), authority,
      caller: 'ssh-transport', reason: 'Exact explicit remote operation through verified native SSH',
      reportSafeCommand: 'Verified SSH transport; remote effect outcome is separate',
      env: { PATH: '/usr/bin:/bin', HOME: master.directory.path, LC_ALL: 'C', SSH_ASKPASS_REQUIRE: 'never' },
      abortSignal, captureOutput: false, cleanupTreeOnExit: true };
  }
}

async function runChannel(execution: Pick<ExecutionService, 'runCommand'>, request: CommandExecutionRequest, script: string,
  controller: AbortController): Promise<SshTransportResult> {
  let outputLimited = false;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const output: Buffer[] = [];
  const receive = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
    if (stream === 'stdout') stdoutBytes += chunk.length;
    else stderrBytes += chunk.length;
    if (stdoutBytes > 256 * 1024 || stderrBytes > 256 * 1024 || stdoutBytes + stderrBytes > 384 * 1024) {
      outputLimited = true;
      controller.abort();
      return;
    }
    if (stream === 'stdout') output.push(Buffer.from(chunk));
  };
  const { stdout: _stdout, stderr: _stderr, ...native } = await execution.runCommand({
    ...request, timeoutMs: 15_000,
    onStdout: chunk => receive(chunk, 'stdout'),
    onStderr: chunk => receive(chunk, 'stderr'),
    onStdin: input => { void input.write(Buffer.from(script)).then(() => input.end()).catch(() => controller.abort()); },
  });
  return { transport: { ...native, receipt: { ...native.receipt, outputSummary: 'Native SSH transport output is retained only in the bounded remote owner.' } },
    stdout: Buffer.concat(output), bytes: { stdout: stdoutBytes, stderr: stderrBytes }, outputLimited,
    cleanup: native.terminationFailed ? 'unknown' : 'complete' };
}
