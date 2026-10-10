import type { LocalJob } from '../model.js';
import type { BackgroundTask } from './model.js';
import { redactReportText } from '../../../core/security/redaction.js';

/** Retained context is redacted before any report or notice can select a fragment. */
export function retainedOutput(job: LocalJob): string {
  const content = ['stdout', 'stderr'].map(stream => Buffer.from(job[stream as 'stdout' | 'stderr'], 'base64').toString('utf8')).join('\n');
  const redactions = new Set<string>();
  const safe = redactReportText(content, 262144, { preserveLines: true, redactions });
  return job.truncated || redactions.has('unsafe-content') ? 'Sensitive or truncated output is withheld; use /jobs output to inspect retained stream metadata.' : safe;
}
export function taskSnapshot(job: LocalJob, live?: BackgroundTask): BackgroundTask {
  return { id: job.id, command: job.command, cwd: job.directory.path, pid: live?.pid, startedAt: job.createdAt,
    state: ['queued', 'paused'].includes(job.status) ? job.status as 'queued' | 'paused'
      : job.status === 'running' || job.status === 'unknown' ? live?.state ?? 'unknown'
      : job.status === 'cancelled' ? 'killed' : 'exited',
    exitCode: job.exitCode, output: retainedOutput(job), outputTruncated: job.truncated,
    ...(live?.failure ? { failure: live.failure } : job.status === 'failed' || job.status === 'unknown' ? { failure: job.note } : {}) };
}
