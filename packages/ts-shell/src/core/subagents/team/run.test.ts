import { describe, expect, it, vi } from "vitest";
import { runTeam, type TeamRunInput } from "./run.js";
import type { ProposalRequest } from "./fanOut.js";
import type { Refutation } from "./convergence.js";

/**
 * The wiring, and the one rule it owns: a proposer never reviews itself.
 *
 * Everything else is a step that already has its own tests; what is asserted
 * here is which claims reach which reviewer, and that an incomplete run says
 * so instead of reporting a conclusion it did not reach.
 */

const requests: readonly ProposalRequest[] = [
  { id: "a", prompt: "Why is the build slow?", perspective: "profile" },
  { id: "b", prompt: "Why is the build slow?", perspective: "read config" },
  { id: "c", prompt: "Why is the build slow?", perspective: "compare history" },
];

function input(overrides: Partial<TeamRunInput> = {}): TeamRunInput {
  return {
    requests,
    propose: async request => `claim-${request.id}`,
    review: async () => [],
    ...overrides,
  };
}

describe("running a team pass", () => {
  it("never shows a proposer its own claim", async () => {
    // Self-review produces a `none-found` from the one source guaranteed to
    // agree, which is enough on its own to report "survived".
    const seen: { reviewerId: string; ids: string[] }[] = [];
    await runTeam(input({
      review: async ({ reviewerId, proposals }) => {
        seen.push({ reviewerId, ids: proposals.map(proposal => proposal.id) });
        return [];
      },
    }));

    expect(seen.map(entry => entry.reviewerId).sort()).toEqual(["a", "b", "c"]);
    for (const entry of seen) {
      expect(entry.ids).not.toContain(entry.reviewerId);
      expect(entry.ids).toHaveLength(2);
    }
  });

  it("converges on what the reviewers reported", async () => {
    const result = await runTeam(input({
      review: async ({ reviewerId }) => reviewerId === "b"
        ? [{ proposalId: "a", reviewerId: "b", kind: "counterevidence", reason: "The profile disagrees.", evidence: ["src"] }]
        : [],
    }));

    const a = result.convergence.outcomes.find(entry => entry.proposalId === "a")!;
    expect(a.verdict).toBe("refuted");
    // Nobody backed a clean check for b or c, so neither is claimed to have survived.
    expect(result.convergence.outcomes.find(entry => entry.proposalId === "b")?.verdict).toBe("unresolved");
  });

  it("records a review that failed rather than aborting the run", async () => {
    const result = await runTeam(input({
      review: async ({ reviewerId }) => {
        if (reviewerId === "c") throw new Error("provider refused");
        return [];
      },
    }));

    expect(result.failedReviews).toEqual([{ reviewerId: "c", reason: "provider refused" }]);
    expect(result.convergence.outcomes).toHaveLength(3);
    expect(result.limitation).toContain("incomplete");
  });

  it("says the run is incomplete when a proposer produced nothing", async () => {
    const result = await runTeam(input({
      propose: async request => {
        if (request.id === "b") throw new Error("timeout");
        return `claim-${request.id}`;
      },
    }));

    expect(result.reviewable.map(proposal => proposal.id)).toEqual(["a", "c"]);
    expect(result.limitation).toContain("1 proposer(s) produced nothing");
  });

  it("does not run a cross-review when only one proposal exists", async () => {
    const review = vi.fn(async () => []);
    const result = await runTeam(input({
      requests: [requests[0]!],
      review,
    }));

    expect(review).not.toHaveBeenCalled();
    expect(result.convergence.outcomes[0]?.verdict).toBe("unresolved");
  });

  it("states the same-model limitation even when everything finished", async () => {
    const result = await runTeam(input({
      review: async ({ reviewerId, proposals }) => proposals.map(proposal => ({
        proposalId: proposal.id, reviewerId, kind: "none-found" as const,
        reason: "read the sources", evidence: ["src"],
      })),
    }));

    expect(result.convergence.outcomes.every(entry => entry.verdict === "survived")).toBe(true);
    expect(result.limitation).toContain("not independent confirmation");
    expect(result.limitation).not.toContain("incomplete");
  });

  it("carries a refutation through from reviewer to verdict", async () => {
    const refutation: Refutation = {
      proposalId: "a", reviewerId: "c", kind: "condition-mismatch",
      reason: "Only true for incremental builds.", evidence: ["history"],
    };
    const result = await runTeam(input({
      review: async ({ reviewerId }) => reviewerId === "c" ? [refutation] : [],
    }));

    expect(result.convergence.outcomes.find(entry => entry.proposalId === "a")?.reason).toContain("Only true for incremental builds");
  });
});
