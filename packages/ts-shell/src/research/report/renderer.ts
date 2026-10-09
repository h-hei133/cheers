import type { ResearchRun } from '../run/model.js';
import { redactReportText } from '../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';

type LedgerProjection = { scopeId: string; inputTokens: number; outputTokens: number; unknown: number; historyUnknown: boolean; breach: boolean };

export function researchReport(run: ResearchRun, ledger?: LedgerProjection): string {
  return researchReportProjection(run, ledger).text;
}
export function researchReportProjection(run: ResearchRun, ledger?: LedgerProjection): { readonly text: string; readonly truncated: boolean } {
  const lines = [`# Research: ${run.brief?.question ?? run.request.question}`, '',
    `Run: ${run.id}; status: ${run.status}; brief revision: ${run.briefRevision}; deadline: ${run.deadlineAt}.`,
    `Mode: ${run.brief?.mode ?? run.request.mode ?? 'undetermined'}; depth: ${run.request.depth}.`,
    ...(run.stopReason ? [`Stopped: ${run.stopReason}`] : []), '',
    ...(run.fragments.length ? [...run.fragments].sort((a, b) => a.index - b.index).flatMap(fragment => [`## ${fragment.title}`, '', fragment.text, ''])
      : ['## Retained draft', '', run.draft?.summary ?? 'No validated draft was produced.', '']),
    '## Bound claims', '', ...run.claims.flatMap(claim => [
      `- ${claim.id} (${claim.questionId}; ${claim.support}): ${claim.text}`, `  Applicability: ${claim.scope}`, `  Support reason: ${claim.supportReason}`,
      ...claim.supporting.map(reference => `  Supporting: [source:${reference.sourceId}#${reference.excerptId}] ${reference.quote}`),
      ...claim.opposing.map(reference => `  Opposing: [source:${reference.sourceId}#${reference.excerptId}] ${reference.quote}`),
      ...[...claim.conflicts, ...claim.limitations].map(value => `  Limit: ${value}`)]), '',
    '## Coverage and review', '', `Covered subquestions: ${run.draft?.covered.join(', ') || 'none'}.`,
    `Uncovered subquestions: ${run.draft ? run.draft.uncovered.join(', ') || 'none' : run.brief?.questions.map(question => question.id).join(', ') || 'brief not established'}.`,
    `Independent review: ${run.review?.status ?? 'not-run'}; correlation: ${run.review?.correlation ?? 'not established'}.`,
    run.review?.limitation ?? 'No independent review ran. No truth verification is implied.',
    ...(run.review?.findings.flatMap(finding => [`- ${finding.claimId}: ${finding.outcome}. ${finding.reason}`,
      ...finding.references.map(reference => `  [source:${reference.sourceId}#${reference.excerptId}] ${reference.quote}`)]) ?? []),
    ...[...(run.draft?.limitations ?? []), ...(run.review?.uncovered ?? []), ...run.gapQuestions].map(value => `- ${value}`), '',
    '## Sources and retrieval trail', '', ...run.sources.flatMap(source => [
      `- ${source.id}: ${source.title ?? source.locator}`, `  Locator: ${source.locator}${source.finalLocator ? `; final: ${source.finalLocator}` : ''}`,
      `  Status: ${source.status}${source.stale ? ' (stale)' : ''}; provider: ${source.provider}; fetched: ${source.fetchedAt}.`,
      `  Hash: ${source.contentHash ?? 'unavailable'}; scope: ${source.hashScope ?? 'unavailable'}; parser: ${source.parser ?? 'unknown'}.`,
      ...(source.retrieval ? [`  API response bytes: ${source.retrieval.bytes}; raw SHA-256: ${source.retrieval.contentHash}; fetched: ${source.retrieval.fetchedAt}; URL: ${source.retrieval.url}.`] : []),
      `  Versions/identifiers: ${JSON.stringify(source.identifiers ?? {})}; related replicas: ${source.replicas.join(', ') || 'none'}.`,
      ...source.excerpts.map(excerpt => `  [source:${source.id}#${excerpt.id}] ${excerpt.location}`),
      ...source.limits.map(limit => `  Limit: ${limit}`), ...(source.failure ? [`  Failure: ${source.failure}`] : [])]), '',
    '## Resource and save state', '', ledger
      ? `Shared scope ${ledger.scopeId}: ${ledger.inputTokens} input + ${ledger.outputTokens} output tokens settled; ${ledger.unknown} unknown attempts; history unknown: ${ledger.historyUnknown}; breach: ${ledger.breach}.`
      : 'The native shared ledger could not be projected; resource totals are unverified.',
    `Save: ${run.save.status}${run.save.path ? `; path: ${run.save.path}` : ''}${run.save.operationId ? `; operation: ${run.save.operationId}` : ''}.`,
    'Replica counts, completed review and report generation do not verify correctness.', '',
    ...run.events.map(event => `${event.sequence}. ${event.timestamp} ${event.kind}/${event.stage}: ${event.detail}`), ''];
  const redactions = new Set<string>();
  const text = redactReportText(lines.join('\n'), 120000, { preserveLines: true, redactions }).split('\n').map(neutraliseForDisplay).join('\n');
  const truncated = redactions.has('truncated');
  return { text: truncated ? `${text}\n\n[Research report projection truncated at 120000 characters. Retained state includes omitted detail; saving this incomplete projection as a complete report is refused.]` : text, truncated };
}
