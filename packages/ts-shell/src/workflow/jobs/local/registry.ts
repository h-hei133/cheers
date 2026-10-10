import { StringDecoder } from 'node:string_decoder';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { CommandExecutionResult, ExecutionService } from '../../../runtime/execution/types.js';
import { createOutputSink, type OutputSink } from './output.js';
import type { BackgroundInput, BackgroundRunner, BackgroundTask, LocalJournalPort } from './model.js';
import { taskSnapshot } from './snapshot.js';
import { closeOutput } from './settlement.js';

interface Operation { readonly controller: AbortController; readonly sink: OutputSink; readonly stdout: StringDecoder;
  readonly stderr: StringDecoder; settlement: Promise<void>; }

/** Live handles belong to this owner; restart never signals a numeric PID from a journal. */
export class TaskRegistry implements BackgroundRunner {
  private static instance?: TaskRegistry;
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly operations = new Map<string, Operation>();
  private readonly listeners = new Set<(task: BackgroundTask) => void>();
  private nextId = 1;
  private closing = false;
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
      settlement: Promise.resolve() };
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
      onStdout: bytes => this.append(id, 'stdout', bytes), onStderr: bytes => this.append(id, 'stderr', bytes) });
    operation.settlement = run().then(result => this.finish(id, result)).catch(async () => {
      try { await closeOutput(operation.sink); } catch { /* Failed persistence cannot prove command settlement. */ }
      try { this.journal?.unverified(id); } catch { /* The original dispatch tombstone remains. */ }
      this.retain({ ...this.tasks.get(id)!, state: 'unknown', failure: 'Native command settlement or output publication is unavailable.' });
    }).finally(() => { clearInterval(watch); this.operations.delete(id); if (this.journal) this.tasks.delete(id); });
    return this.get(id) ?? this.tasks.get(id)!;
  }
  async stop(id: string): Promise<boolean> {
    const operation = this.operations.get(id); if (!operation) return false;
    operation.controller.abort(); await operation.settlement;
    return this.get(id)?.state === 'killed';
  }
  async close(): Promise<void> {
    this.closing = true; const selected = [...this.operations.values()];
    for (const operation of selected) operation.controller.abort();
    await Promise.allSettled(selected.map(operation => operation.settlement));
  }
  private append(id: string, stream: 'stdout' | 'stderr', bytes: Buffer): void | Promise<void> {
    const operation = this.operations.get(id)!;
    this.journal?.output(id, stream, bytes);
    const pending = operation.sink.append(operation[stream].write(bytes));
    this.tasks.set(id, { ...this.tasks.get(id)!, output: operation.sink.tail, outputTruncated: operation.sink.truncated,
      get outputPath() { return operation.sink.spillPath; } });
    return pending;
  }
  private async finish(id: string, result: CommandExecutionResult): Promise<void> {
    const operation = this.operations.get(id)!;
    // The journal already contains the original bytes. Decoder tails belong to
    // the live text sink only; writing them back would invent replacement bytes
    // when a command ends with an incomplete UTF-8 sequence.
    const stdoutTail = operation.stdout.end();
    const stderrTail = operation.stderr.end();
    await closeOutput(operation.sink, stdoutTail + stderrTail);
    let publicationFailed = false;
    try { this.journal?.finish(id, result); } catch { publicationFailed = true; }
    const task: BackgroundTask = { ...this.tasks.get(id)!, state: publicationFailed || result.terminationFailed ? 'unknown'
      : result.status === 'cancelled' ? 'killed' : 'exited', exitCode: result.exitCode ?? undefined,
      output: operation.sink.tail, outputTruncated: operation.sink.truncated, outputPath: operation.sink.spillPath,
      ...(result.status === 'failed' || result.status === 'timeout' ? { failure: `Native command ${result.status}${result.outputFailed ? '; output consumption is unverified' : ''}.` } : {}),
      ...(result.spawnErrorCode ? { failure: `${result.spawnErrorCode}: Local command could not start.` } : {}),
      ...(publicationFailed || result.terminationFailed ? { failure: 'Native cleanup or durable publication remains unverified.' } : {}) };
    this.retain(task);
    for (const listener of this.listeners) { try { listener(this.get(id) ?? task); } catch { /* Observer failure cannot alter native evidence. */ } }
  }
  private retain(task: BackgroundTask): void {
    this.tasks.delete(task.id); this.tasks.set(task.id, task);
    if (this.journal) return; // Durable completion is read from storage after its live handle settles.
    let excess = [...this.tasks.values()].filter(value => !this.operations.has(value.id) || value.id === task.id).length - 100;
    for (const [id] of this.tasks) { if (excess <= 0) break; if (!this.operations.has(id) || id === task.id) { this.tasks.delete(id); excess--; } }
  }
}
