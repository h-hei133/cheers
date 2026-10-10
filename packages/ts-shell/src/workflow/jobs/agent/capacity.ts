import type { JobJournal } from '../model.js';

/** Reserve output in addition to immutable run metadata. JSON expands a byte up to six times. */
export function reservedAgentBytes(journal: JobJournal): number {
  return (journal.agents ?? []).filter(job => ['queued', 'running', 'paused', 'unknown'].includes(job.status))
    .reduce((sum, job) => sum + Math.max(0, 393216 + 2048 - Buffer.byteLength(JSON.stringify(job.text))), 0);
}
