import { randomUUID } from 'node:crypto';
import { sameValue } from '../../../config/values.js';
import { JobStateError, type JobOrigin } from '../model.js';
import type { JobStore } from '../store.js';
import type { AgentCheckpoint, AgentJob } from './model.js';
import { agentDigest, prompt } from './codec.js';

export class AgentJournal {
  constructor(readonly store: JobStore) {}
  list(): readonly AgentJob[] { return this.store.read().agents ?? []; }
  get(id: string): AgentJob {
    const selected = this.list().find(job => job.id === id); if (!selected) throw new JobStateError('unavailable'); return selected;
  }
  create(instruction: string, origin: JobOrigin): AgentJob {
    if (!prompt(instruction)) throw new JobStateError('invalid');
    const id = randomUUID();
    this.store.update((current, scope) => {
      const agents = current.agents ?? [];
      if (agents.filter(job => ['queued', 'paused', 'running', 'unknown'].includes(job.status)).length >= 2) throw new JobStateError('capacity');
      const intent = { id, scope, origin, createdAt: Date.now(), prompt: instruction };
      const job: AgentJob = { ...intent, backend: 'agent', digest: agentDigest(intent), childSessionId: `sess_agent_${id}`, runs: [], status: 'queued', text: '',
        truncated: false, output: 'pending', note: 'Approved side-agent intent; no model request was dispatched.' };
      return { ...current, agents: [...agents, job] };
    }); return this.get(id);
  }
  change(expected: AgentJob, change: Partial<Pick<AgentJob, 'child' | 'checkpoint' | 'runs' | 'status' | 'text' | 'truncated' | 'output' | 'note'>>): AgentJob {
    this.store.update((current, scope) => {
      const selected = current.agents?.find(job => job.id === expected.id);
      if (!sameValue(expected.scope, scope)) throw new JobStateError('detached');
      if (!selected || !sameValue(selected, expected)) throw new JobStateError('conflict');
      const next = { ...selected, ...change };
      if (selected.child && !sameValue(selected.child, next.child) || next.runs.length < selected.runs.length) throw new JobStateError('conflict');
      for (let i = 0; i < selected.runs.length; i++) {
        const prior = selected.runs[i]!; const updated = next.runs[i]!;
        if (!updated || updated.id !== prior.id || updated.prompt !== prior.prompt || updated.createdAt !== prior.createdAt
          || !updated.dispatchPossible || !sameValue(updated.checkpoint, prior.checkpoint)
          || (i < selected.runs.length - 1 || next.runs.length > selected.runs.length) && !sameValue(prior, updated)) throw new JobStateError('conflict');
      }
      return { ...current, agents: current.agents!.map(job => job.id === selected.id ? next : job) };
    }); return this.get(expected.id);
  }
  arm(expected: AgentJob, checkpoint: AgentCheckpoint, instruction: string): AgentJob {
    if (!prompt(instruction) || !expected.child || !sameValue(checkpoint, expected.checkpoint)
      || !['queued', 'paused', 'completed', 'failed', 'cancelled'].includes(expected.status) || expected.runs.length >= 16
      || this.list().filter(job => job.id !== expected.id && ['queued', 'paused', 'running', 'unknown'].includes(job.status)).length >= 2)
      throw new JobStateError('conflict');
    const run = { id: randomUUID(), prompt: instruction, createdAt: Date.now(), dispatchPossible: true as const, status: 'running' as const, checkpoint };
    return this.change(expected, { status: 'running', runs: [...expected.runs, run], text: '', truncated: false, output: 'pending',
      note: 'The exact live agent owner may dispatch this run; its ID is never replayed.' });
  }
  append(id: string, runId: string, chunk: string): void {
    const job = this.get(id); if (job.runs.at(-1)?.id !== runId || job.status !== 'running') throw new JobStateError('conflict');
    const bytes = Buffer.from(job.text + chunk);
    const retained = bytes.subarray(0, 65536).toString('utf8');
    // Do not split the retained last UTF-8 codepoint and expand beyond the byte cap.
    const text = Buffer.byteLength(retained) <= 65536 ? retained : bytes.subarray(0, 65533).toString('utf8');
    this.change(job, { text, truncated: job.truncated || bytes.length > 65536 });
  }
  settle(id: string, runId: string, status: AgentJob['status'], checkpoint?: AgentCheckpoint): AgentJob {
    const job = this.get(id); const run = job.runs.at(-1); if (run?.id !== runId) throw new JobStateError('conflict');
    return this.change(job, { status, runs: [...job.runs.slice(0, -1), { ...run, status }], ...(checkpoint ? { checkpoint } : {}),
      output: status === 'unknown' ? 'unknown' : status === 'paused' || status === 'cancelled' ? 'interrupted' : 'complete',
      note: status === 'unknown' ? 'Agent cleanup, transcript or publication is unverified; this run cannot resume.'
        : `Agent run ${status}; model output is not verification or goal acceptance.` });
  }
}
