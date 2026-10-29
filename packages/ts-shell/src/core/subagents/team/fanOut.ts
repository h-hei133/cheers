/**
 * Asking several agents the same question without letting them see each other.
 *
 * The point of a second proposal is not a second opinion — it is that each can
 * be pointed at the other's claim and asked to break it. That only works if
 * they were independent to begin with, so this runs them in parallel and hands
 * every one the same question and nothing else: no shared transcript, no
 * summary of what the others said, no ordering hint.
 *
 * What it does not do is decide anything. Proposals come back, refutation is a
 * separate pass, and convergence is `convergence.ts`. Keeping the three apart
 * is what makes the middle step testable without a provider and the last step
 * testable without an agent.
 *
 * Failures are per proposal, not per batch. One agent that times out must not
 * discard the proposal another one produced — but it must also not be replaced
 * by an empty string, because a blank proposal that later "survives" is worse
 * than an honest gap.
 */

export interface ProposalRequest {
  /** Identity the reviewer will cite; stable across the run. */
  readonly id: string;
  /** What this agent is told to do, which is the same for every proposer. */
  readonly prompt: string;
  /** How this proposer differs — a role, a stance, a method. Never the others' answers. */
  readonly perspective: string;
}

export interface ProposalResult {
  readonly id: string;
  readonly status: "proposed" | "failed" | "cancelled";
  /** The claim, when one was produced. */
  readonly claim?: string;
  /** Why it produced nothing, in the terms a user reads. */
  readonly failure?: string;
}

export interface FanOutOutcome {
  readonly proposals: readonly ProposalResult[];
  /** How many produced a claim. */
  readonly proposed: number;
  /**
   * Whether every proposer answered.
   *
   * False means the set of competing hypotheses is incomplete, which changes
   * what convergence can conclude: a claim that "survived" among two of three
   * proposals was never weighed against the missing one.
   */
  readonly complete: boolean;
}

/**
 * Run every proposer, in parallel, and report what each produced.
 *
 * `run` is supplied rather than imported: the caller owns the model, the tool
 * pool and the permission gate, and this function must not be able to start an
 * agent the host did not authorize.
 */
export async function fanOutProposals(
  requests: readonly ProposalRequest[],
  run: (request: ProposalRequest, signal: AbortSignal | undefined) => Promise<string>,
  signal?: AbortSignal,
): Promise<FanOutOutcome> {
  // Cancellation has to reach a run that is already inside `await`. A proposer
  // that never settles would otherwise hold the whole pass open forever: the
  // signal stops the next proposer from starting and marks one that throws, but
  // it cannot interrupt a promise nobody rejects. So the abort settles the
  // affected proposers here, and a later real result is discarded.
  const results = await Promise.all(requests.map(async (request): Promise<ProposalResult> => {
    if (signal?.aborted) return cancelled(request.id);
    return new Promise<ProposalResult>(resolve => {
      let settled = false;
      const finish = (result: ProposalResult): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const onAbort = (): void => finish(cancelled(request.id));
      signal?.addEventListener("abort", onAbort, { once: true });
      run(request, signal).then(
        text => {
          const claim = text.trim();
          // An empty answer is not a proposal. Reporting it as one would let a
          // silent failure enter convergence as a claim nobody can refute.
          finish(claim
            ? { id: request.id, status: "proposed", claim }
            : { id: request.id, status: "failed", failure: "The proposer returned nothing." });
        },
        error => finish({
          id: request.id,
          status: signal?.aborted ? "cancelled" : "failed",
          failure: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }));
  const proposed = results.filter(result => result.status === "proposed").length;
  return { proposals: results, proposed, complete: proposed === requests.length };
}

function cancelled(id: string): ProposalResult {
  return { id, status: "cancelled", failure: "The run was cancelled before this proposal finished." };
}
