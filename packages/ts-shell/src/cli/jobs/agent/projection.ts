import { sameValue } from '../../../config/values.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { utf8PageEnd } from '../../../core/text/utf8.js';
import type { AgentJob } from '../../../workflow/jobs/agent/model.js';
import type { JobsComposition } from '../model.js';
import { report } from '../projection.js';

export function agentProjection(host: JobsComposition, job: AgentJob) {
  const liveOwner = host.agents.hasLive(job.id); const bound = sameValue(job.scope, host.jobs.scope());
  return { id: job.id, backend: job.backend, prompt: job.prompt, childSessionId: job.childSessionId,
    origin: job.origin, status: !bound || job.status === 'running' && !liveOwner ? 'unknown' : job.status,
    storedStatus: job.status, liveOwner, detached: !bound, checkpoint: job.checkpoint, runs: job.runs,
    output: job.output, truncated: job.truncated, note: job.note, completionProof: false };
}
export function agentPage(job: AgentJob, offset: number): string {
  const bytes = Buffer.from(job.text);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length) throw new Error('Invalid agent output offset.');
  const redactions = new Set<string>(); redactReportText(job.text, 262144, { preserveLines: true, redactions });
  const next = utf8PageEnd(bytes, offset, 16384, job.output === 'pending');
  const content = job.truncated || redactions.has('unsafe-content') ? 'Sensitive or truncated agent output is withheld.'
    : next === offset && offset < bytes.length ? 'A UTF-8 character is still arriving; reuse this byte cursor.'
    : report(bytes.subarray(offset, next).toString('utf8'), 24000);
  return `Agent text; next byte ${next}/${bytes.length}; truncated ${job.truncated}; completeness ${job.output}.\n${content}`;
}
