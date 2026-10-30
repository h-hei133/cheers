import { createHash, randomUUID } from 'node:crypto';
import type { ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js';
import type { AskQuestion, AskResponse, InteractiveAsk } from '../../tools/ask/contract.js';
import { neutraliseForDisplay } from '../../text/safety.js';
import type { TeamRun } from './run.js';
import type { ReadReceipt } from './evidence.js';
import type { Refutation } from './convergence.js';

type AdoptionStatus = 'adopted' | 'declined' | 'unanswered' | 'cancelled' | 'unavailable' | 'error' | 'stale' | 'empty';
const ADOPT = 'Adopt report';

/** A completed pass is visible to the user before any report reaches the main model. */
export async function publishTeamReport(outcome: TeamRun, findings: readonly Refutation[], evidence: readonly ReadReceipt[],
  context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const reportId = randomUUID();
  const withheld = (status: Exclude<AdoptionStatus, 'adopted'>): ToolExecutionResult => ({
    success: false, output: status === 'empty' ? `Proposed 0 of ${outcome.proposals.length}. No report is available to adopt.`
      : `Team report was not adopted (${status}). No report content was added to the main conversation.`,
    metadata: { adoption: { status, reportId } },
  });
  const blocked = currentStatus(context);
  if (blocked) return withheld(blocked);
  if (!outcome.reviewable.length) return withheld('empty');
  if (!context.interactiveAsk) return withheld('unavailable');
  const data = {
    proposals: outcome.proposals.map(result => ({ id: result.id, status: result.status, claim: result.claim ?? null,
      evidenceRefs: [...result.evidenceRefs ?? []], falsifiers: [...result.falsifiers ?? []] })),
    outcomes: outcome.convergence.outcomes.map(entry => ({ proposalId: entry.proposalId, verdict: entry.verdict, reason: entry.reason })),
    failedReviews: outcome.failedReviews.map(review => ({ reviewerId: review.reviewerId, reason: 'The reviewer did not finish.' })),
    findings: findings.map(finding => ({ ...finding, evidence: [...finding.evidence] })),
    evidence: evidence.map(receipt => ({ ...receipt })),
    limitation: outcome.limitation,
  };
  const output = [
    `Proposed ${data.proposals.filter(result => result.status === 'proposed').length} of ${data.proposals.length}.`,
    ...data.outcomes.map(entry => `${entry.proposalId}: ${entry.verdict} — ${neutraliseForDisplay(entry.reason)}`),
    ...data.proposals.filter(proposal => proposal.claim !== null).flatMap(proposal => [
      `${proposal.id} claim: ${neutraliseForDisplay(proposal.claim!)}`,
      `Falsifiers: ${proposal.falsifiers.map(neutraliseForDisplay).join('; ')}`,
      `Supporting reads: ${proposal.evidenceRefs.join(', ') || 'unverified'}.`,
    ]),
    ...data.findings.map(finding => `${finding.reviewerId} on ${finding.proposalId}: ${finding.kind} — ${neutraliseForDisplay(finding.reason)}; evidence: ${finding.evidence.join(', ') || 'none'}`),
    ...data.evidence.map(receipt => `${receipt.id}: ${JSON.stringify(neutraliseForDisplay(receipt.locator))}, ${receipt.location} ${receipt.start}-${receipt.end}, SHA256 ${receipt.contentHash}.`),
    ...(data.failedReviews.length ? [`Reviews that did not finish: ${data.failedReviews.map(review => review.reviewerId).join(', ')}.`] : []),
    `Limitation: ${data.limitation}`,
    'Adoption shares this report with the main model. It grants no tool permission or approval.',
  ].join('\n');
  const serialized = JSON.stringify(data);
  // Never request approval for a truncated preview while publishing a larger report.
  if (Buffer.byteLength(serialized) > 65536 || Buffer.byteLength(output) > 65536) return withheld('error');
  const digest = createHash('sha256').update(JSON.stringify([context.sessionId, context.workspaceRoot, context.taskId, output, data])).digest('hex');
  const question: AskQuestion = { id: reportId,
    question: `Team report preview\n\n${output}\n\nAdd this report to the main conversation?`,
    options: [{ label: 'Keep report out' }, { label: ADOPT }],
  };
  const response = await requestAdoption(context.interactiveAsk, question, context.abortSignal);
  const changed = currentStatus(context);
  if (changed) return withheld(changed);
  if (response.status !== 'completed') return withheld(response.status);
  const answer = Object.hasOwn(response.answers, reportId) ? response.answers[reportId] : undefined;
  if (answer !== ADOPT) return withheld(typeof answer === 'string' && answer.trim() ? 'declined' : 'unanswered');
  return { success: true, output, metadata: { ...data, adoption: { status: 'adopted', reportId, digest } } };
}

function currentStatus(context: ToolExecutionContext): 'cancelled' | 'stale' | undefined {
  if (context.abortSignal?.aborted) return 'cancelled';
  try { if (!context.admission?.()) return undefined; } catch { /* Unreadable authority cannot publish the report. */ }
  return 'stale';
}

/** Cancellation retires this publication even if a custom question host ignores its signal. */
function requestAdoption(ask: InteractiveAsk, question: AskQuestion, signal?: AbortSignal): Promise<AskResponse> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (response: AskResponse): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      resolve(response);
    };
    const cancel = (): void => finish({ status: 'cancelled', answers: {} });
    const failed = (): void => finish({ status: 'error', answers: {} });
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      void ask([question], signal).then(response => {
        if (settled) return;
        if (!response || !['completed', 'cancelled', 'unavailable', 'error'].includes(response.status)
          || !response.answers || typeof response.answers !== 'object' || Array.isArray(response.answers)) { failed(); return; }
        finish(response);
      }, failed).catch(failed);
    } catch { failed(); }
  });
}
