import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import type { LocalExecutionHandle } from '../../../runtime/execution/types.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { CommandExecutionResult, ExecutionService } from '../../../runtime/execution/types.js';
import { createOutputSink } from './output.js';
import { appendAdoptedOutput, appendOutput, type OperationOutput } from './stream.js';
import type { BackgroundInput, BackgroundRunner, BackgroundTask, LocalJournalPort } from './model.js';
import { taskSnapshot } from './snapshot.js';
import { closeOutput } from './settlement.js';

interface Operation extends OperationOutput { readonly controller: AbortController;
  settlement: Promise<void>; readonly handle?: LocalExecutionHandle; readonly input?: BackgroundInput; readonly adopted?: boolean; watch?: ReturnType<typeof setInterval>; }

/** Live handles belong to this owner; restart never signals a numeric PID from a journal. */
export class TaskRegistry implements BackgroundRunner {
  private static instance?: TaskRegistry;
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly operations = new Map<string, Operation>();
  private readonly listeners = new Set<(task: BackgroundTask) => void>();
  private nextId = 1;
  private closing = false;
  /** Provisional tasks promoted to the durable journal. */
  private readonly promoted = new Set<string>();
  /** Outcomes for callers waiting on a provisional task's promotion decision. */
  private readonly promotion = new Map<string, { readonly promise: Promise<'promoted' | 'settled' | 'refused'>; readonly resolve: (outcome: 'promoted' | 'settled' | 'refused') => void }>();
  spillDirectory: string | undefined;
  constructor(private readonly execution: Pick<ExecutionService, 'runCommand'> = createDefaultExecutionService(),
    private readonly journal?: LocalJournalPort) {}
  static getShared(): TaskRegistry { return this.instance ??= new TaskRegistry(); }
  onEnded(listener: (task: BackgroundTask) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  list(): readonly BackgroundTask[] {
    return this.journal ? this.journal.list().map(job => taskSnapshot(job, this.tasks.get(job.id))) : [...this.tasks.values()];
  }
  get(id: string): BackgroundTask | undefined {
    if (!this.journal) return this.tasks.get(id);
    try { return taskSnapshot(this.journal.get(id), this.tasks.get(id)); } catch { return undefined; }
  }
  hasLive(id: string): boolean { return this.operations.has(id); }
  settled(id: string): Promise<void> { return this.operations.get(id)?.settlement ?? Promise.resolve(); }
  start(input: BackgroundInput): BackgroundTask {
    if (this.closing) throw new Error('Local job owner is closing.');
    const id = this.journal?.create(input) ?? `bg_${this.nextId++}`;
    return this.launch(id, input);
  }
  adopt(handle: LocalExecutionHandle, input: BackgroundInput): BackgroundTask {
    if (this.closing) throw new Error('Local job owner is closing.');
    const id = randomUUID();
    const task: BackgroundTask = { id, command: input.command, cwd: input.cwd, pid: handle.pid, startedAt: Date.now(), state: 'running', output: '' };
    this.tasks.set(id, task);
    let resolveSettlement!: () => void;
    let rejectSettlement!: (reason?: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveSettlement = resolve;
      rejectSettlement = reject;
    });
    const operation: Operation = { controller: new AbortController(), sink: createOutputSink({ limitBytes: 65536, label: id,
      ...(!this.journal && this.spillDirectory ? { spillDirectory: this.spillDirectory } : {}) }), stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8'),
      pendingOutput: [], pendingBytes: 0, pendingTruncated: false, settlement, handle, input, adopted: true };
    this.operations.set(id, operation);
    let resolvePromotion!: (outcome: 'promoted' | 'settled' | 'refused') => void;
    const promotion = new Promise<'promoted' | 'settled' | 'refused'>(resolve => { resolvePromotion = resolve; });
    this.promotion.set(id, { promise: promotion, resolve: resolvePromotion });
    const off = handle.onOutput(text => {
      const output = this.operations.get(id);
      if (output) appendAdoptedOutput(id, text, output, this.tasks, this.journal, this.promoted.has(id));
    });
    const settle = async (result: Pick<CommandExecutionResult, 'status' | 'exitCode' | 'terminationFailed' | 'outputFailed' | 'spawnErrorCode'>): Promise<void> => {
      off();
      if (operation.watch) { clearInterval(operation.watch); operation.watch = undefined; }
      // Publication must finish while the promotion marker is still set; the
      // cleanup below is what makes the task invisible to `hasLive`.
      let failure: unknown;
      try {
        await this.finish(id, result);
      } catch (error) {
        failure = error;
        this.tasks.set(id, {
          ...this.tasks.get(id)!,
          state: 'unknown',
          failure: 'Native cleanup or durable publication remains unverified.',
        });
      }
      this.settlePromotion(id, 'settled');
      this.operations.delete(id);
      if (!this.promoted.has(id)) this.tasks.delete(id);
      this.promoted.delete(id);
      if (failure) rejectSettlement(failure);
      else resolveSettlement();
    };
    handle.result.then(() => void settle({ status: 'completed', exitCode: 0 })).catch((error: unknown) => {
      const failure = error as { cancelled?: boolean; timedOut?: boolean; code?: number | string | null; terminationFailed?: boolean; outputFailed?: boolean };
      void settle({ status: failure.cancelled ? 'cancelled' : failure.timedOut ? 'timeout' : 'failed',
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        ...(failure.terminationFailed ? { terminationFailed: true } : {}), ...(failure.outputFailed ? { outputFailed: true } : {}) });
    });
    return task;
  }
  promote(id: string): 'promoted' | 'settled' | 'refused' {
    const operation = this.operations.get(id); const task = this.tasks.get(id);
    const outcome = ((): 'promoted' | 'settled' | 'refused' => {
      if (this.promoted.has(id)) return 'promoted';
      // No live operation means the child settled before the promotion; the
      // caller still owns the result and must not be told the job was lost.
      if (!operation?.handle || !operation.input || !task) return 'settled';
      if (!this.journal) return 'refused';
      try {
        this.journal.promote(id, operation.input, task.pid);
        // Output may arrive while the child is still a foreground wait. Publish
        // that prefix before marking the task promoted so restart and notices
        // see the same stream the live sink already showed.
        for (const chunk of operation.pendingOutput) this.journal.output(id, 'stdout', chunk);
        if (operation.pendingTruncated) this.journal.truncate(id, 'stdout');
        operation.pendingOutput.length = 0;
        operation.pendingBytes = 0;
        operation.pendingTruncated = false;
        this.promoted.add(id);
        // A promoted foreground child is admitted exactly like a launched job:
        // revoking the grant kills the same PID, not a copy of it.
        operation.watch = setInterval(() => { if (this.journal?.admission(id)) void operation.handle?.kill(); }, 100);
        operation.watch.unref();
        return 'promoted';
      } catch {
        // Capacity or journal refusal: the provisional task must not keep a live
        // child that nothing can address, so it is killed here.
        try { this.journal?.unverified(id); } catch { /* The original fence remains authoritative. */ }
        void operation.handle.kill();
        return 'refused';
      }
    })();
    this.settlePromotion(id, outcome);
    return outcome;
  }
  whenPromoted(id: string): Promise<'promoted' | 'settled' | 'refused'> {
    return this.promotion.get(id)?.promise ?? Promise.resolve('settled');
  }
  promoteForeground(): number {
    let promoted = 0;
    for (const [id, operation] of this.operations) {
      if (!operation.adopted || this.promoted.has(id)) continue;
      if (this.promote(id) === 'promoted') promoted++;
    }
    return promoted;
  }
  private settlePromotion(id: string, outcome: 'promoted' | 'settled' | 'refused'): void {
    const waiter = this.promotion.get(id);
    if (!waiter) return;
    this.promotion.delete(id);
    waiter.resolve(outcome);
  }
  resume(id: string, input: BackgroundInput): BackgroundTask {
    if (this.closing || this.tasks.has(id) || !this.journal) throw new Error('No newly approved queued job is available.');
    const job = this.journal.get(id);
    if (job.dispatchPossible || job.status !== 'queued') throw new Error('Only an undispatched queued job may resume.');
    if (job.command !== input.command || job.directory.path !== input.cwd || job.timeoutMs !== (input.timeoutMs ?? 300000))
      throw new Error('The queued command or directory changed.');
    return this.launch(id, input);
  }
  private launch(id: string, input: BackgroundInput): BackgroundTask {
    const task: BackgroundTask = { id, command: input.command, cwd: input.cwd, pid: undefined, startedAt: Date.now(), state: 'starting', output: '' };
    this.tasks.set(id, task);
    const operation: Operation = { controller: new AbortController(), sink: createOutputSink({ limitBytes: 65536, label: id,
      ...(!this.journal && this.spillDirectory ? { spillDirectory: this.spillDirectory } : {}) }), stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8'),
      pendingOutput: [], pendingBytes: 0, pendingTruncated: false, settlement: Promise.resolve() };
    this.operations.set(id, operation);
    // The durable replay fence is established before calling the native execution owner.
    try { this.journal?.arm(id); }
    catch { this.tasks.set(id, { ...task, state: 'unknown', failure: 'Local dispatch fence could not be established.' });
      this.operations.delete(id); void closeOutput(operation.sink).catch(() => {}); return this.tasks.get(id)!; }
    const shell = input.shell ?? (process.platform === 'win32' ? { command: 'cmd.exe', args: ['/d', '/s', '/c', input.command] }
      : { command: '/bin/sh', args: ['-c', input.command] });
    const watch = setInterval(() => { if (this.journal?.admission(id)) operation.controller.abort(); }, 100); watch.unref();
    const run = async () => this.execution.runCommand({ operationKind: 'command.run', command: shell.command, args: shell.args,
      cwd: input.cwd, workspaceRoot: input.cwd, caller: 'background-command', reason: 'Run one explicitly admitted background command.',
      reportSafeCommand: input.command, authority: input.authority ?? { mode: 'unknown-transitional', source: 'unknown-transitional', reason: 'Unbound legacy caller.' },
      timeoutMs: input.timeoutMs ?? 300000, abortSignal: operation.controller.signal, captureOutput: false, cleanupTreeOnExit: true,
      ...(input.env ? { env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...input.env } } : {}),
      onStarted: pid => { this.journal?.started(id); this.tasks.set(id, { ...this.tasks.get(id)!, pid, state: 'running' }); },
      onStdout: bytes => appendOutput(id, 'stdout', bytes, this.operations.get(id)!, this.tasks, this.journal),
      onStderr: bytes => appendOutput(id, 'stderr', bytes, this.operations.get(id)!, this.tasks, this.journal) });
    operation.settlement = run().then(result => this.finish(id, result)).catch(async () => {
      try { await closeOutput(operation.sink); } catch { /* Failed persistence cannot prove command settlement. */ }
      try { this.journal?.unverified(id); } catch { /* The original dispatch tombstone remains. */ }
      this.retain({ ...this.tasks.get(id)!, state: 'unknown', failure: 'Native command settlement or output publication is unavailable.' });
    }).finally(() => { clearInterval(watch); this.operations.delete(id); if (this.journal) this.tasks.delete(id); });
    return this.get(id) ?? this.tasks.get(id)!;
  }
  async stop(id: string): Promise<boolean> {
    const operation = this.operations.get(id); if (!operation) return false;
    if (operation.handle) await operation.handle.kill();
    else operation.controller.abort();
    await operation.settlement;
    return this.get(id)?.state === 'killed';
  }
  async close(): Promise<void> {
    this.closing = true; const selected = [...this.operations.values()];
    for (const operation of selected) {
      if (operation.handle) void operation.handle.kill();
      else operation.controller.abort();
    }
    await Promise.allSettled(selected.map(operation => operation.settlement));
  }
  private async finish(id: string, result: Pick<CommandExecutionResult, 'status' | 'exitCode' | 'terminationFailed' | 'outputFailed' | 'spawnErrorCode'>): Promise<void> {
    const operation = this.operations.get(id)!;
    // The journal already contains the original bytes. Decoder tails belong to
    // the live text sink only; writing them back would invent replacement bytes
    // when a command ends with an incomplete UTF-8 sequence.
    const stdoutTail = operation.stdout.end();
    const stderrTail = operation.stderr.end();
    await closeOutput(operation.sink, stdoutTail + stderrTail);
    let publicationFailed = false;
    // A foreground-adopted task is journaled only after promotion; an ordinary
    // launched task is journaled from the start.
    if (!operation.adopted || this.promoted.has(id)) {
      try { this.journal?.finish(id, result); } catch {
        publicationFailed = true;
        // A live task cannot be the only record of a settled child. Keep the
        // durable row unknown rather than leaving it looking runnable forever.
        try { this.journal?.unverified(id); } catch { /* The original tombstone remains. */ }
      }
    }
    const task: BackgroundTask = { ...this.tasks.get(id)!, state: publicationFailed || result.terminationFailed ? 'unknown'
      : result.status === 'cancelled' ? 'killed' : 'exited', exitCode: result.exitCode ?? undefined,
      output: operation.sink.tail, outputTruncated: operation.sink.truncated, outputPath: operation.sink.spillPath,
      ...(result.status === 'failed' || result.status === 'timeout' ? { failure: `Native command ${result.status}${result.outputFailed ? '; output consumption is unverified' : ''}.` } : {}),
      ...(result.spawnErrorCode ? { failure: `${result.spawnErrorCode}: Local command could not start.` } : {}),
      ...(publicationFailed || result.terminationFailed ? { failure: 'Native cleanup or durable publication remains unverified.' } : {}) };
    this.retain(task);
    if (!operation.adopted || this.promoted.has(id)) {
      for (const listener of this.listeners) { try { listener(this.get(id) ?? task); } catch { /* Observer failure cannot alter native evidence. */ } }
    }
  }
  private retain(task: BackgroundTask): void {
    this.tasks.delete(task.id); this.tasks.set(task.id, task);
    if (this.journal) return; // Durable completion is read from storage after its live handle settles.
    let excess = [...this.tasks.values()].filter(value => !this.operations.has(value.id) || value.id === task.id).length - 100;
    for (const [id] of this.tasks) { if (excess <= 0) break; if (!this.operations.has(id) || id === task.id) { this.tasks.delete(id); excess--; } }
  }
}
