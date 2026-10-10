import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';
import type { RemoteJob } from '../../workflow/jobs/model.js';
import type { SshProfile } from '../../runtime/execution/ssh/model.js';
import type { ToolExecutionResult } from '../../tools/types.js';

export function display(value: unknown, max = 12000): string {
  return neutraliseForDisplay(redactReportText(typeof value === 'string' ? value : JSON.stringify(value, null, 2), max, { preserveLines: true }));
}
/** Reports never publish a raw substring whose credential prefix may lie on another page. */
export function pageDisplay(page: { readonly bytes: Buffer; readonly context?: Buffer; readonly size: number }): string {
  if (!page.context || page.context.length !== page.size || page.size > 65536) return 'Remote content lacks bounded redaction context; this page is withheld.';
  const whole = page.context.toString('utf8');
  const redactions = new Set<string>(); redactReportText(whole, 262144, { preserveLines: true, redactions });
  if (redactions.has('unsafe-content'))
    return 'Remote stream contains sensitive patterns; content is withheld from reports. Raw byte offsets remain valid.';
  return display(page.bytes.toString('utf8'), 24000);
}
export function profilePreview(profile?: SshProfile): string {
  if (!profile) return 'No SSH profile is selected.';
  return display(`Host: ${profile.selection.user}@${profile.selection.host}:${profile.selection.port}\nPinned host key: ${profile.fingerprint}\nRemote workspace: ${profile.selection.workspace}\nCredentials and ambient SSH configuration are excluded from display. The remote account, login shell, manager and submitted code are trusted for evidence integrity. Commands have that account\'s OS rights; workspace selection is a cwd, not an OS sandbox.\nJobs: 300s deadline, 256MiB memory, 32 tasks, 64KiB stored per stream; excess output drained and discarded. Cancellation covers the selected native cgroup; escaped same-account processes are outside that guarantee.`);
}
export function jobProjection(job: RemoteJob) {
  return { id: job.id, backend: job.backend, status: job.status, output: job.output, dispatchPossible: job.dispatchPossible,
    lifetime: job.lifetime,
    invocationId: job.invocationId, exitCode: job.exitCode, cancellation: job.cancellation, origin: job.origin, note: job.note };
}
export function jobResult(job: RemoteJob): ToolExecutionResult {
  return { success: job.status !== 'unknown' && job.status !== 'failed', output: display(jobProjection(job)),
    metadata: { ...jobProjection(job), evidence: job.invocationId ? 'remote-reported' : job.dispatchPossible ? 'dispatch-uncertain' : 'local-intent', goalCompletionProof: false } };
}
