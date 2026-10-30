import type { Proposal, Refutation } from './convergence.js';

export interface ReviewRequest {
  readonly reviewerId: string;
  readonly proposals: readonly Proposal[];
  readonly signal: AbortSignal | undefined;
}

type ReviewResult = { readonly findings: readonly Refutation[]; readonly failure?: undefined }
  | { readonly findings: readonly []; readonly failure: { readonly reviewerId: string; readonly reason: string } };

/** Cancellation settles the review boundary; late native work has no publication authority. */
export function reviewProposal(input: { readonly signal?: AbortSignal; readonly review: (request: ReviewRequest) => Promise<readonly Refutation[]> }, reviewerId: string, proposals: readonly Proposal[]): Promise<ReviewResult> {
  const signal = input.signal;
  const cancelled = (): ReviewResult => ({ findings: [], failure: { reviewerId, reason: 'The run was cancelled before this review finished.' } });
  if (signal?.aborted) return Promise.resolve(cancelled());
  return new Promise(resolve => {
    let settled = false;
    const finish = (result: ReviewResult): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish(cancelled());
    const failed = (error: unknown): void => finish({ findings: [], failure: {
      reviewerId, reason: error instanceof Error ? error.message : String(error),
    } });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      void input.review({ reviewerId, proposals, signal }).then(findings => {
        if (settled) return;
        if (findings.some(finding => finding.reviewerId !== reviewerId
          || !proposals.some(proposal => proposal.id === finding.proposalId))
          || new Set(findings.map(finding => finding.proposalId)).size !== findings.length) {
          failed(new Error('Review findings name an unassigned proposal, duplicate proposal or different reviewer.'));
          return;
        }
        finish({ findings: findings.map(finding => ({ ...finding, evidence: [...finding.evidence] })) });
      }, failed).catch(failed);
    } catch (error) { failed(error); }
  });
}
