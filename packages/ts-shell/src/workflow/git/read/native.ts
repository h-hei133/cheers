import fs from 'node:fs';
import which from 'which';
import { createDefaultExecutionService, type CommandExecutionResult, type ExecutionService } from '../../../runtime/execution/service.js';
import { hashBytes } from './fingerprint.js';

export interface GitInvocation {
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly input?: Buffer;
  readonly approved?: boolean;
  readonly signal?: AbortSignal;
  readonly acceptedCodes?: readonly number[];
}
const SAFE = ['--no-pager', '--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.pager=cat'];
/** Git owns repository semantics; the shared execution service owns processes. */
export class NativeGit {
  readonly executable: string;
  readonly env: Readonly<Record<string, string>>;
  constructor(readonly root: string, readonly execution: Pick<ExecutionService, 'runCommand'> = createDefaultExecutionService(), readonly assertSourceAccess?: (absolute: string) => void) {
    this.executable = fs.realpathSync(which.sync('git'));
    this.env = Object.freeze(Object.fromEntries(Object.entries({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' }).filter((entry): entry is [string, string] => entry[1] !== undefined)));
  }
  identity(): string {
    const stat = fs.statSync(this.executable);
    return hashBytes(JSON.stringify({ executable: this.executable, file: [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, hashBytes(fs.readFileSync(this.executable))], env: Object.entries(this.env).sort() }));
  }
  async run(call: GitInvocation): Promise<CommandExecutionResult> {
    let size = 0;
    const controller = new AbortController();
    const abort = () => controller.abort();
    call.signal?.addEventListener('abort', abort, { once: true });
    if (call.signal?.aborted) controller.abort();
    try {
      return await this.execution.runCommand({ operationKind: 'command.run', command: this.executable, args: [...SAFE, ...call.args],
        cwd: call.cwd ?? this.root, workspaceRoot: this.root,
        authority: { mode: call.approved ? 'approved-for-write' : 'read-only', source: call.approved ? 'tool-runtime-approval' : 'none', reason: call.approved ? 'Exact prepared Git invocation passed the ordinary tool gate.' : 'Fixed inspection with executable helpers disabled or refused.' },
        caller: 'git-workflow', reason: 'Native Git workbench', reportSafeCommand: `git ${call.args.map(value => JSON.stringify(value)).join(' ')}`,
        timeoutMs: 60_000, abortSignal: controller.signal,
        env: this.env,
        onOutput: chunk => { size += Buffer.byteLength(chunk); if (size > 8 * 1024 * 1024) controller.abort(); },
        ...(call.input ? { onStdin: async input => { try { await input.write(call.input!); } finally { input.end(); } } } : {}),
      });
    } finally { call.signal?.removeEventListener('abort', abort); }
  }
  async text(args: readonly string[], options: Omit<GitInvocation, 'args'> = {}): Promise<string> {
    const result = await this.run({ args, ...options });
    if (!['completed', 'failed'].includes(result.status) || !(options.acceptedCodes ?? [0]).includes(result.exitCode ?? -1)) {
      throw new Error(`Git inspection unavailable (${result.status}, exit ${result.exitCode ?? 'unknown'}).`);
    }
    return result.stdout;
  }
  async assertPassive(signal?: AbortSignal): Promise<void> {
    const result = await this.run({ args: ['config', '--get-regexp', '^filter\\..*\\.(clean|smudge|process)$'], signal });
    if (result.exitCode === 1 && result.status === 'failed') return;
    if (result.exitCode !== 0 || result.status !== 'completed') throw new Error('Cannot inspect Git helper configuration.');
    if (result.stdout.split('\n').some(line => /^filter\.\S+\s+\S/.test(line))) {
      throw new Error('Configured Git filters require execution approval. Passive Git inspection did not execute them.');
    }
  }
}
