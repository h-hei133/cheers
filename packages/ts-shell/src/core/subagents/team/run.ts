/**
 * The whole competing-hypotheses pass, in one place.
 *
 * Three steps, each of which already exists on its own: propose independently,
 * have every proposer try to break the others, then decide what survived. This
 * module is only the wiring between them — it holds no prompt text beyond what
 * each step needs and no policy beyond "a proposer never reviews itself".
 *
 * The wiring is worth its own file because the rule it encodes is not obvious
 * from any single step: a reviewer must not be shown its own proposal as a
 * candidate to refute. Self-review would produce a `none-found` from the one
 * source guaranteed to agree, and that alone is enough to report "survived".
 */

import { converge, type Convergence, type Proposal, type Refutation } from "./convergence.js";
import { fanOutProposals, type ProposalRequest, type ProposalResult } from "./fanOut.js";

export interface TeamRun {
  readonly proposals: readonly ProposalResult[];
  readonly convergence: Convergence;
  /** Proposals that produced a claim and could therefore be reviewed. */
  readonly reviewable: readonly Proposal[];
  /** Reviewers whose pass failed, so the convergence is missing their view. */
  readonly failedReviews: readonly { readonly reviewerId: string; readonly reason: string }[];
  /** What this run is worth, stated once. */
  readonly limitation: string;
}

export interface TeamRunInput {
  readonly requests: readonly ProposalRequest[];
  readonly signal?: AbortSignal;
  /** Run one proposer. The host owns the model, tools and permission gate. */
  readonly propose: (request: ProposalRequest, signal: AbortSignal | undefined) => Promise<string>;
  /**
   * Run one reviewer against the proposals it may refute.
   *
   * It is given only the other proposers' claims — never its own — and returns
   * findings in the shape `convergence.ts` reads.
   */
  readonly review: (input: {
    readonly reviewerId: string;
    readonly proposals: readonly Proposal[];
    readonly signal: AbortSignal | undefined;
  }) => Promise<readonly Refutation[]>;
}

/**
 * Run the pass and decide what survived.
 *
 * A review that throws is recorded as a missing view rather than aborting the
 * run: two proposals with one reviewer still say something, and the conclusion
 * is marked incomplete so nothing claims more than it has.
 */
export async function runTeam(input: TeamRunInput): Promise<TeamRun> {
  const outcome = await fanOutProposals(input.requests, input.propose, input.signal);
  const reviewable: Proposal[] = outcome.proposals.flatMap(result =>
    result.status === "proposed" && result.claim !== undefined ? [{ id: result.id, claim: result.claim }] : []);

  const refutations: Refutation[] = [];
  const failedReviews: { reviewerId: string; reason: string }[] = [];
  await Promise.all(reviewable.map(async proposal => {
    const others = reviewable.filter(candidate => candidate.id !== proposal.id);
    // One proposer and nothing to compare it against is not a team; there is
    // no cross-review to run, and pretending otherwise would add a reviewer
    // that can only agree with itself.
    if (others.length === 0) return;
    try {
      refutations.push(...await input.review({ reviewerId: proposal.id, proposals: others, signal: input.signal }));
    } catch (error) {
      failedReviews.push({ reviewerId: proposal.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }));

  return {
    proposals: outcome.proposals,
    convergence: converge(reviewable, refutations),
    reviewable,
    failedReviews,
    limitation: outcome.complete && failedReviews.length === 0
      ? converge(reviewable, []).limitation
      : `${converge(reviewable, []).limitation} `
        + `This run is incomplete: ${outcome.proposals.length - outcome.proposed} proposer(s) produced nothing`
        + `${failedReviews.length ? ` and ${failedReviews.length} reviewer(s) did not finish` : ""}.`,
  };
}
