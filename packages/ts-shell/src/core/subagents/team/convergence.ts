/**
 * Converging independent proposals by trying to refute them.
 *
 * A single agent asked for an answer produces one hypothesis and then argues
 * for it. Two agents that cannot see each other produce two, and the value is
 * not the extra text — it is that each can be pointed at the other's claim and
 * asked to break it. What survives that is worth more than either alone, and
 * what does not survive is worth knowing about before it reaches the user.
 *
 * This module is the arithmetic of that: given proposals and the findings
 * reviewers returned about them, decide what survived, what was refuted, and
 * what nobody could establish. It deliberately holds no agent, no prompt and no
 * I/O, so the rule can be tested directly rather than inferred from a run.
 *
 * The rule is asymmetric on purpose. A refutation counts only when it is backed
 * by something the reviewer actually read — an opinion is not evidence, and a
 * reviewer with no sources must not be able to kill a proposal. The absence of
 * a refutation proves nothing at all, so `none-found` yields "survived" only in
 * the weak sense that nothing was found against it, and the result says so.
 */

/** What a reviewer found when it tried to break one proposal. */
export type RefutationKind =
  /** Evidence that contradicts the claim. */
  | "counterevidence"
  /** The claim holds only under conditions that do not apply here. */
  | "condition-mismatch"
  /** The reviewer could not check it, so it establishes nothing either way. */
  | "insufficient"
  /** The reviewer checked and found nothing against it. */
  | "none-found";

export interface Refutation {
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly kind: RefutationKind;
  readonly reason: string;
  /**
   * Identities of sources the reviewer actually read and is citing.
   *
   * Not a count and not free text: a refutation with no reference cannot be
   * told apart from one that was invented, so it is not allowed to count.
   */
  readonly evidence: readonly string[];
}

export interface Proposal {
  readonly id: string;
  readonly claim: string;
}

export type ProposalVerdict =
  /** At least one refutation with evidence against it. */
  | "refuted"
  /** Checked and nothing found against it; not proof, and reported as such. */
  | "survived"
  /** Only unbacked or inconclusive findings; nothing was established. */
  | "unresolved";

export interface ProposalOutcome {
  readonly proposalId: string;
  readonly verdict: ProposalVerdict;
  /** Why, in the terms the user will read. */
  readonly reason: string;
  /** The refutations that decided it, for a reader who wants the argument. */
  readonly decisive: readonly Refutation[];
}

export interface Convergence {
  readonly outcomes: readonly ProposalOutcome[];
  /** Refutations naming a proposal that was never proposed. */
  readonly orphaned: readonly Refutation[];
  /**
   * What this conclusion is worth, stated rather than implied.
   *
   * Every reviewer here is the same model in a separate context, so agreement
   * is not independent confirmation. Saying that once, here, keeps a caller
   * from presenting convergence as more than it is.
   */
  readonly limitation: string;
}

const LIMITATION =
  "Proposals were reviewed by instances of the same model in separate contexts. "
  + "Agreement is not independent confirmation, and a proposal that survived was not proven — only not refuted by the evidence those reviewers read.";

/**
 * Decide what survived, what was refuted, and what remains open.
 *
 * A proposal is refuted when any reviewer produced counter-evidence or a
 * condition mismatch and cited at least one source. It is unresolved when the
 * only findings were unbacked or inconclusive. It survived when at least one
 * reviewer actually checked it and none refuted it.
 */
export function converge(proposals: readonly Proposal[], refutations: readonly Refutation[]): Convergence {
  const known = new Set(proposals.map(proposal => proposal.id));
  const orphaned = refutations.filter(refutation => !known.has(refutation.proposalId));
  const outcomes = proposals.map((proposal): ProposalOutcome => {
    const about = refutations.filter(refutation => refutation.proposalId === proposal.id);
    const backed = about.filter(refutation => refutation.evidence.length > 0);
    const decisive = backed.filter(refutation => refutation.kind === "counterevidence" || refutation.kind === "condition-mismatch");
    if (decisive.length > 0) {
      return {
        proposalId: proposal.id,
        verdict: "refuted",
        reason: decisive.map(refutation => refutation.reason).filter(Boolean).join(" ") || "Refuted by cited evidence.",
        decisive,
      };
    }
    // A reviewer that read sources and found nothing against it is the only
    // thing that can produce "survived"; a review that never ran cannot.
    const checked = backed.filter(refutation => refutation.kind === "none-found");
    if (checked.length > 0) {
      return {
        proposalId: proposal.id,
        verdict: "survived",
        reason: "Checked against cited sources with nothing found against it.",
        decisive: checked,
      };
    }
    return {
      proposalId: proposal.id,
      verdict: "unresolved",
      reason: about.length > 0
        ? "No reviewer backed a finding with a source it actually read, so nothing was established either way."
        : "No reviewer examined this proposal.",
      decisive: [],
    };
  });
  return { outcomes, orphaned, limitation: LIMITATION };
}

/** The verdicts worth showing as an answer, strongest first. */
export function strongest(convergence: Convergence): readonly ProposalOutcome[] {
  const rank: Record<ProposalVerdict, number> = { survived: 0, unresolved: 1, refuted: 2 };
  return [...convergence.outcomes].sort((left, right) => rank[left.verdict] - rank[right.verdict]);
}
