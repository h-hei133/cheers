import { describe, expect, it } from "vitest";
import { decideProviderEditConfirmation } from "./providerEditConfirmation.js";
import { planProviderEditProposal } from "./providerEditPlanner.js";
import { buildProviderEditProposalResult } from "./providerEditResult.js";

describe("providerEditResult", () => {
  it("projects provider proposal states as stopped no-write result surface", async () => {
    const plan = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      targets: [{ path: "src/app.ts", readSummary: "summary" }],
      provider: {
        proposeEdit: () => ({
          operationKind: "generated-replacement",
          targets: [{ path: "src/app.ts", summary: "safe proposal only" }],
        }),
      },
    });
    const result = buildProviderEditProposalResult({
      sessionId: "sess_provider_edit",
      prompt: "use provider to propose edit",
      plan,
    });

    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalReason).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toContain(
      "provider-edit-result:mutation:not-run",
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      "provider-edit proposal=",
    );
    expect(JSON.stringify(result)).not.toContain(".private-agents-real");
  });

  it("projects handoff-ready confirmation without write success", async () => {
    const plan = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      targets: [{ path: "src/app.ts", readSummary: "summary" }],
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/app.ts",
              summary: "exact mapping",
              oldText: "old",
              newText: "new",
            },
          ],
        }),
      },
    });
    if (!plan.manifest) {
      throw new Error("expected manifest");
    }
    const confirmation = decideProviderEditConfirmation({
      manifest: plan.manifest,
      confirmExactSingleTarget: true,
    });
    const result = buildProviderEditProposalResult({
      sessionId: "sess_provider_edit",
      prompt: "use provider to propose exact edit",
      plan,
      confirmation,
    });

    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toContain(
      "provider-edit-confirmation:handoff-ready:exact-fenced-replacement",
    );
    expect(result.codingResult?.evidence).toContain(
      "provider-edit-result:mutation-authority:not-granted",
    );
  });
});
