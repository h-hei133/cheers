import type { JobJournal } from '../model.js';
export const LOCAL_RESERVATION = 262144;
export function reservedLocalBytes(journal: JobJournal): number {
  return (journal.local ?? []).filter(job => ['queued', 'running', 'paused', 'unknown'].includes(job.status))
    .reduce((sum, job) => sum + Math.max(0, LOCAL_RESERVATION - Buffer.byteLength(JSON.stringify(job))), 0);
}
