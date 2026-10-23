import type { AgentDefinitionRow, AgentDiscoveryView } from '../../runtime/agents.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker } from '../overlay.js';
import type { JobsComposition } from '../../jobs/model.js';
import { createReport, span } from '../../../core/commands/report/projection.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { agentPage, agentProjection } from '../../jobs/agent/projection.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import type { AgentJob } from '../../../workflow/jobs/agent/model.js';

/**
 * Agent master/detail inspector.
 *
 * The panel shows retained live agent jobs from the jobs owner and the effective
 * definition catalog from the subagent owner. Opening it never starts, stops or
 * resumes work; definition actions still delegate to `/agents`, while live rows
 * are read-only views of the existing journal.
 */
export function agentsPicker(
  read: (() => readonly AgentDefinitionRow[]) | undefined,
  context: CommandContext,
  discovery?: () => AgentDiscoveryView,
  jobs?: JobsComposition,
): Picker {
  let offered = new Set<string>();
  let live = new Map<string, { readonly job: AgentJob; readonly projection: ReturnType<typeof agentProjection> }>();
  let details = new Map<string, readonly string[]>();
  let diagnostics: readonly string[] = [];
  let definitions = new Map<string, AgentDefinitionRow>();
  const initialSession = jobs?.session;
  let initialWorkspace: ReturnType<typeof captureWorkspaceRoot> | undefined;
  try {
    if (initialSession?.projectRoot) {
      initialWorkspace = captureWorkspaceRoot(initialSession.projectRoot, initialSession.projectRoot, 'read');
    }
  } catch {
    initialWorkspace = undefined;
  }
  const isCurrent = (): boolean => {
    try {
      if (context.admission?.() !== undefined) return false;
      if (!jobs) return true;
      const current = jobs.context.session;
      if (current !== initialSession || current.id !== initialSession?.id
        || current.createdAt !== initialSession?.createdAt || current.projectRoot !== initialSession?.projectRoot
        || current.id !== context.sessionId || !initialWorkspace) return false;
      const workspace = captureWorkspaceRoot(current.projectRoot, current.projectRoot, 'read');
      return workspace.path === initialWorkspace.path && workspace.identity === initialWorkspace.identity;
    } catch { return false; }
  };
  const safe = (value: string, max = 240): string => redactReportText(neutraliseForDisplay(value), max, {
    projectRoot: context.projectRoot ?? context.cwd,
  });
  const refresh = (): readonly Option[] => {
    const view = discovery?.() ?? { definitions: read?.() ?? [], diagnostics: [] };
    const agentJobs = jobs ? jobs.agents.journal.list().map(job => ({
      job,
      projection: agentProjection(jobs, job),
    })) : [];
    diagnostics = view.diagnostics;
    definitions = new Map(view.definitions.map(definition => [definition.name.toLowerCase(), definition]));
    live = new Map(agentJobs.map(entry => [`agent:${entry.job.id}`, entry]));
    const rows: Option[] = [];
    for (const { job, projection } of agentJobs) {
      const id = `agent:${job.id}`;
      const prompt = safe(projection.prompt, 160);
      const detail = [
        `Status: ${projection.status}${projection.storedStatus !== projection.status ? ` (stored ${projection.storedStatus})` : ''}`,
        `Output: ${projection.output}`,
        `Child session: ${safe(projection.childSessionId, 120)}`,
        `Runs: ${projection.runs.length}`,
        ...(projection.liveOwner ? ['Live owner: yes'] : []),
        ...(projection.detached ? ['Detached from this session'] : []),
        `Prompt: ${prompt}`,
        `Note: ${safe(projection.note)}`,
      ];
      details.set(id, detail);
      rows.push({ id, label: `agent ${job.id.slice(0, 8)}`, detail: prompt, note: `${projection.status} · ${projection.output}` });
    }
    for (const definition of view.definitions) {
      const id = `definition:${definition.name.toLowerCase()}`;
      const detail = [
        `Source: ${definition.source}`,
        `Status: ${definition.status}`,
        ...(definition.model ? [`Model: ${definition.model}`] : []),
        ...(definition.effort ? [`Effort: ${definition.effort}`] : []),
        ...(definition.diagnostic ? [`Diagnostic: ${safe(definition.diagnostic)}`] : []),
        `Description: ${safe(definition.description)}`,
      ];
      details.set(id, detail);
      rows.push({ id, label: definition.name, detail: safe(definition.description),
        note: `${definition.source} · ${definition.status}${definition.model ? ` · ${definition.model}` : ''}${definition.effort ? ` · ${definition.effort}` : ''}` });
    }
    view.diagnostics.forEach((diagnostic, index) => {
      const id = `diagnostic:${index}`;
      const text = safe(diagnostic, 512);
      details.set(id, [`Discovery: ${text}`]);
      rows.push({ id, label: 'Discovery diagnostic', detail: text, note: 'incomplete discovery' });
    });
    offered = new Set(rows.map(row => row.id));
    return rows;
  };
  return {
    isCurrent,
    title: 'Agents',
    form: 'panel',
    empty: 'No live agents or agent definitions are available.',
    loadError: 'Agent definitions require a bound session runtime.',
    footer: 'Enter inspects a live agent or effective definition. Changes stay with /agents actions.',
    status: () => isCurrent() ? (diagnostics.length ? `Discovery incomplete: ${diagnostics.length} diagnostic(s).` : undefined)
      : 'Session or configuration changed. Reopen /agents.',
    detail: id => id ? details.get(id) ?? [] : [],
    async load(signal) {
      signal?.throwIfAborted();
      if ((!read && !discovery && !jobs) || !isCurrent()) throw new Error('Agent definitions require a bound session runtime.');
      return refresh();
    },
    async apply(ids) {
      if (ids.length !== 1 || !ids[0] || !isCurrent()) return undefined;
      const id = ids[0];
      if (!offered.has(id)) return undefined;
      if (id.startsWith('agent:')) {
        const selected = live.get(id);
        if (!selected) return undefined;
        const page = agentPage(selected.job, 0);
        const next = Number(/next byte (\d+)\//.exec(page)?.[1]);
        const continuation = Number.isSafeInteger(next) && next > 0 && next < Buffer.byteLength(selected.job.text)
          ? `/jobs output ${selected.job.id} text ${next}` : undefined;
        return { report: createReport({
          title: `Agent ${selected.job.id.slice(0, 8)}`,
          facts: { status: selected.projection.status, output: selected.projection.output,
            childSessionId: selected.projection.childSessionId, runs: selected.projection.runs.length, stream: 'text', offset: 0 },
          lines: [
            ...page.split('\n').map(line => ({ kind: 'text' as const, spans: [span(line, 'code')] })),
            ...(continuation ? [{ kind: 'text' as const, spans: [span(`Later pages: ${continuation}`, 'muted')] }] : []),
          ],
        }) };
      }
      if (id.startsWith('diagnostic:')) return { note: 'Discovery diagnostic is read-only; no agent action was taken.' };
      const name = id.startsWith('definition:') ? id.slice('definition:'.length) : undefined;
      if (!name || !definitions.has(name) || !context.agentsCommand) return undefined;
      try {
        const result = await context.agentsCommand(['show', name], context);
        return result.kind === 'local'
          ? result.report ? { report: result.report } : { note: result.output }
          : { note: result.kind === 'prompt' ? result.notice ?? 'Agent definition requires explicit submission.' : 'Agent definition requires explicit submission.' };
      } catch {
        return { note: 'Agent definition is unavailable. Reopen /agents to refresh.' };
      }
    },
    subscribe(publish) {
      if (!jobs) return () => {};
      if (!isCurrent()) return () => {};
      const timer = setInterval(() => {
        if (!isCurrent()) return;
        try { publish(refresh()); } catch { /* Keep the last readable projection. */ }
      }, 1000);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}
