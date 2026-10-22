import { hubProjection } from '../../jobs/hub.js';
import { localPage } from '../../jobs/projection.js';
import { createReport, span } from '../../../core/commands/report/projection.js';
import type { JobsComposition } from '../../jobs/model.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker } from '../overlay.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';

/** One job as the chooser shows it, independent of the backend's extra fields. */
interface JobRow {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly summary: string;
  readonly detail: readonly string[];
}

/**
 * Read-only master/detail over the session's jobs, agents and workflows.
 *
 * Opening this never cancels work or writes a conversation message; control
 * actions stay with `/jobs`, where each one goes through its own approval.
 * The list polls the stored journal because the journal has no change stream of
 * its own; the interval dies with the subscription.
 */
export function hubPicker(jobs: JobsComposition): Picker {
  const rows: JobRow[] = [];
  const details = new Map<string, readonly string[]>();
  let offered = new Set<string>();
  const initialSession = jobs.session;
  let initialWorkspace: ReturnType<typeof captureWorkspaceRoot> | undefined;
  try {
    if (initialSession?.projectRoot) initialWorkspace = captureWorkspaceRoot(initialSession.projectRoot, initialSession.projectRoot, 'read');
  } catch {
    initialWorkspace = undefined;
  }
  const refresh = (): readonly Option[] => {
    const hub = hubProjection(jobs);
    rows.length = 0;
    details.clear();
    offered = new Set<string>();
    for (const job of hub.jobs as readonly Record<string, unknown>[]) {
      const id = typeof job.id === 'string' ? job.id : '';
      if (!id) continue;
      const kind = typeof job.backend === 'string' ? job.backend : typeof job.kind === 'string' ? job.kind : 'job';
      const status = typeof job.status === 'string' ? job.status : 'unknown';
      const summary = typeof job.command === 'string' ? job.command
        : typeof job.note === 'string' ? job.note : `${kind} ${id.slice(0, 8)}`;
      const detail = [
        `Status: ${status}${typeof job.storedStatus === 'string' && job.storedStatus !== status ? ` (stored ${job.storedStatus})` : ''}`,
        `Backend: ${kind}`,
        ...(typeof job.directory === 'string' ? [`Directory: ${job.directory}`] : []),
        ...(typeof job.timeoutMs === 'number' ? [`Deadline: ${job.timeoutMs} ms`] : []),
        ...(typeof job.exitCode === 'number' ? [`Exit: ${job.exitCode}`] : []),
        ...(job.liveOwner === true ? ['Live owner: yes'] : []),
        ...(job.detached === true ? ['Detached from this session'] : []),
        ...(job.dispatchPossible === true ? ['Dispatch possible: yes'] : []),
        `Output: ${typeof job.output === 'string' ? job.output : 'unknown'}`,
      ];
      rows.push({ id, kind, status, summary, detail });
      details.set(id, detail);
      offered.add(id);
    }
    return rows.map(row => ({ id: row.id, label: `${row.kind} ${row.id.slice(0, 8)}`, detail: row.summary, note: row.status }));
  };
  return {
    title: 'Jobs',
    form: 'panel',
    empty: 'No jobs, agents or workflows in this session.',
    async load() { return refresh(); },
    subscribe(publish) {
      const timer = setInterval(() => { try { publish(refresh()); } catch { /* a journal that cannot be read keeps the last rows */ } }, 1000);
      timer.unref?.();
      return () => clearInterval(timer);
    },
    detail: id => (id ? details.get(id) ?? [] : []),
    async apply(ids) {
      const id = ids[0];
      if (!id || ids.length !== 1 || !offered.has(id)) return undefined;
      let job;
      try { job = jobs.local.get(id); } catch { job = undefined; }
      if (job) {
        // The pager scrolls this page; later offsets stay with `/jobs show`, which
        // applies the same redaction and truncation rules.
        const text = localPage(job, 'stdout', 0);
        return { report: createReport({ title: `Output ${id!.slice(0, 8)}`, facts: { status: job.status, stream: 'stdout', offset: 0 },
          lines: [...text.split('\n').map(line => ({ kind: 'text' as const, spans: [span(line, 'code')] })),
            { kind: 'text' as const, spans: [span('Later pages: /jobs show <id> stdout <offset>.', 'muted')] }] }) };
      }
      return { note: 'Read-only view. Use /jobs show <id> for output, or /jobs cancel <id> for a separately approved action.' };
    },
    isCurrent: () => {
      try {
        const current = jobs.context.session;
        if (current !== initialSession || current.id !== initialSession?.id
          || current.createdAt !== initialSession?.createdAt || current.projectRoot !== initialSession?.projectRoot
          || !initialWorkspace) return false;
        const workspace = captureWorkspaceRoot(current.projectRoot, current.projectRoot, 'read');
        return workspace.path === initialWorkspace.path && workspace.identity === initialWorkspace.identity;
      } catch {
        return false;
      }
    },
  };
}
