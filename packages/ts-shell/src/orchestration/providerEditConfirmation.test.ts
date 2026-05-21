import { describe, expect, it } from "vitest";
import { decideProviderEditConfirmation } from "./providerEditConfirmation.js";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";

describe("providerEditConfirmation", () => {
  it("keeps proposal-only confirmation no-write", () => {
    const manifest = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/app.ts"],
      proposedOperationKind: "generated-replacement",
      targetSummaries: ["summary"],
      exactReadiness: "review-only",
    });

    const decision = decideProviderEditConfirmation({
      manifest,
      confirmProposalOnly: true,
    });

    expect(decision.state).toBe("confirmed-proposal-no-mutation");
    expect(decision.canHandoffToExactLane).toBe(false);
    expect(decision.handoffLane).toBe("none");
    expect(decision.evidence).toContain("provider-edit-confirmation:no-mutation");
  });

  it("marks exact single-target and target-set proposals handoff-ready", () => {
    const single = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/app.ts"],
      proposedOperationKind: "exact-fenced-replacement",
      targetSummaries: ["summary"],
      exactReadiness: "exact-single-target",
    });
    const singleDecision = decideProviderEditConfirmation({
      manifest: single,
      confirmExactSingleTarget: true,
    });
    expect(singleDecision.state).toBe("confirmed-exact-single-target");
    expect(singleDecision.handoffLane).toBe("existing-fenced-replacement");

    const targetSet = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/a.ts", "src/b.ts"],
      proposedOperationKind: "exact-fenced-replacement",
      targetSummaries: ["a", "b"],
      exactReadiness: "exact-target-set",
    });
    const targetSetDecision = decideProviderEditConfirmation({
      manifest: targetSet,
      confirmExactTargetSet: true,
    });
    expect(targetSetDecision.state).toBe("confirmed-exact-target-set");
    expect(targetSetDecision.handoffLane).toBe("existing-target-set-edit");
  });

  it("rejects exact confirmation when provider output is not executable", () => {
    const manifest = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/app.ts"],
      proposedOperationKind: "generated-replacement",
      targetSummaries: ["summary"],
      exactReadiness: "review-only",
    });

    const decision = decideProviderEditConfirmation({
      manifest,
      confirmExactSingleTarget: true,
    });

    expect(decision.state).toBe("provider-output-not-executable");
    expect(decision.canHandoffToExactLane).toBe(false);
  });
});
