import { describe, expect, it } from "vitest";
import { createBrowserActionCacheEntryFromReceipt } from "./actionCacheEntry.js";
import { safeReceipt } from "./actionCacheEntry.test.js";
import { planBrowserReplay } from "./replayPlanner.js";
import { planBrowserSelfHealingProposal } from "./selfHealingPlanner.js";
import { createBrowserSelfHealingPatch } from "./selfHealingPatch.js";
import { renderBrowserSelfHealingSurface } from "./selfHealingSurface.js";

describe("browser self-healing proposal", () => {
  it("creates proposal-only add-runner-binding patches without writes", () => {
    const plan = planBrowserReplay({
      entry: entryFor(),
      runnerAvailable: false,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });
    const proposal = planBrowserSelfHealingProposal({ plan });

    expect(proposal.kind).toBe("add-runner-binding");
    expect(proposal.status).toBe("proposed");
    expect(proposal.confidence).toBe("high");
    expect(proposal.applied).toBe("no");
    expect(proposal.executed).toBe("no");
    expect(proposal.proposedPatch?.wouldWrite).toBe("no");
    expect(proposal.proposedPatch?.cacheWrite).toBe("no");
  });

  it("blocks unsafe patch content and renders compact safe output", () => {
    const patch = createBrowserSelfHealingPatch({
      proposalId: "browser-self-healing-proposal:test",
      kind: "runner-binding-patch",
      target: "RAW_secret",
      summary: "Authorization: Bearer abc",
    });

    expect(patch.status).toBe("blocked");
    expect(patch.unsafe).toBe(true);
    expect(patch.deterministicSerialization).not.toContain("Authorization");
  });

  it("returns not-applicable for successful replay plans", () => {
    const plan = planBrowserReplay({
      entry: entryFor(),
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });
    const proposal = planBrowserSelfHealingProposal({ plan });
    const surface = renderBrowserSelfHealingSurface(proposal);

    expect(proposal.status).toBe("not-applicable");
    expect(surface).toContain("Browser self-healing proposal");
    expect(surface).toContain("Applied: no");
  });

  function entryFor() {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("entry failed");
    }
    return result.entry;
  }
});
