import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';
import { sameValue } from '../../config/values.js';
import { utf8PageEnd } from '../../core/text/utf8.js';
import type { JobsComposition } from './model.js';
import type { LocalJob, RemoteJob } from '../../workflow/jobs/model.js';

export function report(value: unknown, max = 48000): string {
  return neutraliseForDisplay(redactReportText(typeof value === 'string' ? value : JSON.stringify(value, null, 2), max, { preserveLines: true }));
}
export function localProjection(host: JobsComposition, job: LocalJob) {
  const live = host.registry.get(job.id); const bound = sameValue(job.scope, host.jobs.scope());
  return { id: job.id, backend: job.backend, command: job.command, origin: job.origin, status: !bound ? 'unknown'
    : live?.state === 'unknown' || ['running', 'unknown'].includes(job.status) && !host.registry.hasLive(job.id) ? 'unknown' : job.status,
    storedStatus: job.status, dispatchPossible: job.dispatchPossible, output: job.output, truncated: job.truncated,
    exitCode: job.exitCode, liveOwner: host.registry.hasLive(job.id), detached: !bound,
    directory: job.directory.path, timeoutMs: job.timeoutMs, note: job.note };
}
export function remoteProjection(job: RemoteJob) {
  return { id: job.id, backend: job.backend, status: job.status, origin: job.origin, output: job.output,
    dispatchPossible: job.dispatchPossible, note: job.note };
}
export function localPage(job: LocalJob, stream: 'stdout' | 'stderr', offset: number): string {
  const context = Buffer.from(job[stream], 'base64');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > context.length) throw new Error('Output offset is outside the retained stream.');
  const redactions = new Set<string>(); redactReportText(context.toString('utf8'), 262144, { preserveLines: true, redactions });
  const next = utf8PageEnd(context, offset, 16384);
  const content = job.truncated || redactions.has('unsafe-content') ? 'Sensitive or truncated output is withheld from reports.' : report(context.subarray(offset, next).toString('utf8'), 24000);
  return `Local ${stream}; next byte ${next}/${context.length}; truncated ${job.truncated}; completeness ${job.output}.\n${content}`;
}
