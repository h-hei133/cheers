import { sameValue } from '../../../config/values.js';
import { JobStateError, type JobOrigin } from '../model.js';
import { AgentJournal } from './journal.js';
import type { AgentJob, AgentRuntime } from './model.js';
import { settledWithin } from '../settlement.js';

interface Operation {
  readonly controller: AbortController;
  readonly runId: string;
  settlement: Promise<void>;
  requested?: 'paused' | 'cancelled';
}
export class AgentService {
  private readonly operations = new Map<string, Operation>();
  private readonly listeners = new Set<(job: AgentJob) => void>();
  private closing = false;
  constructor(readonly journal: AgentJournal) {}
  hasLive(id: string): boolean { return this.operations.has(id); }
  onEnded(listener: (job: AgentJob) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  create(instruction: string, origin: JobOrigin, runtime: AgentRuntime, queue = false): AgentJob {
    if (this.closing || runtime.admission()) throw new JobStateError('unavailable');
    runtime.preflight();
    const job = this.attach(this.journal.create(instruction, origin), runtime);
    return queue ? job : this.start(job, runtime);
  }
  private attach(expected: AgentJob, runtime: AgentRuntime): AgentJob {
    runtime.preflight();
    const fenced = this.journal.change(expected, { status: 'unknown', output: 'unknown',
      note: 'Child creation may occur at the reserved session ID; uncertain creation never retries.' });
    const bound = runtime.createChild(fenced.childSessionId);
    const job = this.journal.change(fenced, { ...bound, status: 'queued', output: 'pending',
      note: 'The retained independent child is bound; no model request was dispatched.' });
    if (runtime.admission() || runtime.childAdmission(job.child!)) throw new JobStateError('unavailable');
    return job;
  }
  start(expected: AgentJob, runtime: AgentRuntime, instruction?: string): AgentJob {
    if (this.closing || this.hasLive(expected.id) || runtime.admission() || !['queued', 'paused', 'completed', 'failed', 'cancelled'].includes(expected.status)
      || !sameValue(expected, this.journal.get(expected.id))) throw new JobStateError('conflict');
    if (instruction === undefined && expected.runs.length > 0) throw new JobStateError('conflict');
    let job = expected;
    if (!job.child) job = this.attach(job, runtime);
    const checkpoint = runtime.checkpoint(job.child!);
    const admission = () => runtime.admission() ?? runtime.childAdmission(job.child!);
    if (admission()) throw new JobStateError('unavailable');
    job = this.journal.arm(job, checkpoint, instruction ?? job.prompt);
    const run = job.runs.at(-1)!;
    const operation: Operation = { controller: new AbortController(), runId: run.id, settlement: Promise.resolve() };
    this.operations.set(job.id, operation);
    const watch = setInterval(() => { if (admission()) operation.controller.abort(); }, 100); watch.unref();
    const output = (text: string) => {
      if (operation.controller.signal.aborted || admission()) return;
      this.journal.append(job.id, run.id, text);
    };
    operation.settlement = Promise.resolve().then(() => runtime.run({ job, run, signal: operation.controller.signal, output })).then(outcome => {
      const status = outcome.status === 'unknown' ? 'unknown' : operation.controller.signal.aborted ? operation.requested ?? 'cancelled'
        : admission() ? 'failed' : outcome.status;
      this.journal.settle(job.id, run.id, status, outcome.checkpoint);
    }).catch(() => { try { this.journal.settle(job.id, run.id, 'unknown'); } catch { /* The durable fence remains. */ } })
      .finally(() => {
        clearInterval(watch); this.operations.delete(job.id);
        try { for (const listener of this.listeners) { try { listener(this.journal.get(job.id)); } catch { /* Observation is not execution authority. */ } } }
        catch { /* A missing journal cannot produce a completion notice. */ }
      });
    return job;
  }
  async stop(expected: AgentJob, pause = false): Promise<boolean> {
    const current = this.journal.get(expected.id);
    if (expected.digest !== current.digest || expected.runs.at(-1)?.id !== current.runs.at(-1)?.id) throw new JobStateError('conflict');
    expected = current;
    const operation = this.operations.get(expected.id);
    if (!operation) {
      if (expected.runs.length > 0 || !['queued', 'paused'].includes(expected.status)) return false;
      this.journal.change(expected, { status: pause ? 'paused' : 'cancelled', output: pause ? 'pending' : 'interrupted',
        note: pause ? 'Undispatched agent intent paused.' : 'Undispatched agent intent cancelled.' }); return true;
    }
    operation.requested = pause ? 'paused' : 'cancelled'; operation.controller.abort();
    if (!await settledWithin(operation.settlement)) {
      this.journal.settle(expected.id, operation.runId, 'unknown'); return false;
    }
    return this.journal.get(expected.id).status === operation.requested;
  }
  async close(): Promise<void> {
    this.closing = true;
    const selected = [...this.operations.entries()];
    for (const [, operation] of selected) operation.controller.abort();
    const settled = await settledWithin(this.drain());
    for (const [id, operation] of selected) if (!settled && this.operations.has(id)) {
      try { this.journal.settle(id, operation.runId, 'unknown'); } catch { /* Missing authority cannot recreate the owner. */ }
    }
  }
  drain(): Promise<void> { return Promise.allSettled([...this.operations.values()].map(operation => operation.settlement)).then(() => undefined); }
}
