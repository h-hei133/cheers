import { describe, expect, it } from "vitest";
import { converge, strongest, type Proposal, type Refutation } from "./convergence.js";

/**
 * What survives an attempt to break it.
 *
 * The rule is asymmetric on purpose: a refutation has to be backed by something
 * the reviewer read, and the absence of one proves nothing. These cases exist
 * to keep both halves of that from drifting.
 */

const PROPOSALS: readonly Pick<Proposal, 'id' | 'claim'>[] = [
  { id: "a", claim: "The cache is the bottleneck." },
  { id: "b", claim: "The index is the bottleneck." },
];

function refutation(overrides: Partial<Refutation> & Pick<Refutation, "proposalId">): Refutation {
  return { reviewerId: "reviewer", kind: "none-found", reason: "", evidence: [], ...overrides };
}

describe("converging proposals", () => {
  it("refutes a proposal backed by cited counter-evidence", () => {
    const result = converge(PROPOSALS, [refutation({
      proposalId: "a", kind: "counterevidence", reason: "The profile shows no cache misses.",
      evidence: ["source-1"],
    })]);

    const outcome = result.outcomes.find(entry => entry.proposalId === "a")!;
    expect(outcome.verdict).toBe("refuted");
    expect(outcome.reason).toContain("no cache misses");
    expect(outcome.decisive).toHaveLength(1);
  });

  it("treats a condition mismatch as a refutation when it is cited", () => {
    const result = converge(PROPOSALS, [refutation({
      proposalId: "a", kind: "condition-mismatch", reason: "Only under a cold cache.", evidence: ["source-2"],
    })]);

    expect(result.outcomes.find(entry => entry.proposalId === "a")?.verdict).toBe("refuted");
  });

  it("does not let an unbacked refutation kill a proposal", () => {
    // An opinion is not evidence. A reviewer that cites nothing establishes
    // nothing, and must not be able to remove a proposal from consideration.
    const result = converge(PROPOSALS, [refutation({
      proposalId: "a", kind: "counterevidence", reason: "I disagree.", evidence: [],
    })]);

    expect(result.outcomes.find(entry => entry.proposalId === "a")?.verdict).toBe("unresolved");
  });

  it("does not let an inconclusive finding count as a refutation", () => {
    const result = converge(PROPOSALS, [refutation({
      proposalId: "a", kind: "insufficient", reason: "Could not check.", evidence: ["source-3"],
    })]);

    expect(result.outcomes.find(entry => entry.proposalId === "a")?.verdict).toBe("unresolved");
  });

  it("says a proposal survived only when a reviewer actually checked it", () => {
    const result = converge(PROPOSALS, [refutation({
      proposalId: "a", kind: "none-found", reason: "Read the profile and the logs.", evidence: ["source-4"],
    })]);

    expect(result.outcomes.find(entry => entry.proposalId === "a")?.verdict).toBe("survived");
  });

  it("reports an unbacked objection instead of claiming nothing was found", () => {
    // The objection cannot refute — an opinion is not evidence — but a clean
    // check from one reviewer must not erase a disagreement another raised.
    const result = converge(PROPOSALS, [
      refutation({ proposalId: "a", reviewerId: "one", kind: "counterevidence", reason: "I doubt it.", evidence: [] }),
      refutation({ proposalId: "a", reviewerId: "two", kind: "none-found", evidence: ["s1"] }),
    ]);

    const outcome = result.outcomes.find(entry => entry.proposalId === "a")!;
    expect(outcome.verdict).toBe("unresolved");
    expect(outcome.reason).toContain("another objected without citing anything");
  });

  it("keeps the proposal unresolved when another review was inconclusive", () => {
    // An inconclusive check leaves review coverage incomplete even when a peer
    // returned a clean bounded check.
    const result = converge(PROPOSALS, [
      refutation({ proposalId: "a", reviewerId: "one", kind: "insufficient", reason: "Could not check." }),
      refutation({ proposalId: "a", reviewerId: "two", kind: "none-found", evidence: ["s1"] }),
    ]);

    expect(result.outcomes.find(entry => entry.proposalId === "a")?.verdict).toBe("unresolved");
  });

  it("leaves a proposal nobody reviewed unresolved", () => {
    const result = converge(PROPOSALS, []);

    expect(result.outcomes.map(entry => entry.verdict)).toEqual(["unresolved", "unresolved"]);
    expect(result.outcomes[0]?.reason).toContain("No reviewer examined");
  });

  it("prefers a refutation over a clean check from another reviewer", () => {
    const result = converge(PROPOSALS, [
      refutation({ proposalId: "a", reviewerId: "one", kind: "none-found", evidence: ["s1"] }),
      refutation({ proposalId: "a", reviewerId: "two", kind: "counterevidence", reason: "Contradicted.", evidence: ["s2"] }),
    ]);

    const outcome = result.outcomes.find(entry => entry.proposalId === "a")!;
    expect(outcome.verdict).toBe("refuted");
    expect(outcome.decisive.map(entry => entry.reviewerId)).toEqual(["two"]);
  });

  it("reports a finding about a proposal that was never made", () => {
    const result = converge(PROPOSALS, [refutation({ proposalId: "ghost", kind: "counterevidence", evidence: ["s"] })]);

    expect(result.orphaned.map(entry => entry.proposalId)).toEqual(["ghost"]);
    expect(result.outcomes).toHaveLength(2);
  });

  it("states what agreement between same-model reviewers is worth", () => {
    const result = converge(PROPOSALS, []);

    expect(result.limitation).toContain("not independent confirmation");
    expect(result.limitation).toContain("not proven");
  });

  it("orders the answer strongest first", () => {
    const result = converge(PROPOSALS, [
      refutation({ proposalId: "a", kind: "counterevidence", evidence: ["s"] }),
    ]);

    expect(strongest(result).map(entry => entry.proposalId)).toEqual(["b", "a"]);
  });
});
