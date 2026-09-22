import { describe, expect, it } from "vitest";
import { decideBrowserSelfHealingApplyPolicy } from "./selfHealingApplyPolicy.js";
import { inferBrowserSelfHealingProposalKindFromId, planBrowserSelfHealingApply } from "./selfHealingApplyPlan.js";
import { renderBrowserSelfHealingApplySurface } from "./selfHealingApplySurface.js";

describe("browser self-healing apply policy", () => {
  it("allows confirmed explicit cache repair context", () => {
    const policy = decideBrowserSelfHealingApplyPolicy({
      proposalKind: "repair-cache",
      hasExplicitCacheContext: true,
      userConfirmed: true,
    });

    expect(policy.status).toBe("apply-allowed");
    expect(policy.applyable).toBe(true);
  });

  it("requires explicit context and user confirmation", () => {
    expect(decideBrowserSelfHealingApplyPolicy({ proposalKind: "repair-cache" }).status).toBe("apply-needs-explicit-context");
    expect(decideBrowserSelfHealingApplyPolicy({
      proposalKind: "repair-cache",
      hasExplicitCacheContext: true,
    }).status).toBe("apply-needs-user-confirmation");
  });

  it("blocks unsafe and external network proposals", () => {
    expect(decideBrowserSelfHealingApplyPolicy({ proposalKind: "reject-unsafe-evidence" }).status).toBe("apply-blocked-unsafe");
    expect(decideBrowserSelfHealingApplyPolicy({ proposalKind: "external-network-blocked" }).status).toBe("apply-blocked-external-network");
  });

  it("plans apply without writes or execution", () => {
    const plan = planBrowserSelfHealingApply({
      proposalId: "browser-self-healing-proposal:browser-replay-plan:test:corrupted-cache-record",
      proposalKind: "repair-cache",
      hasExplicitCacheContext: true,
      userConfirmed: true,
    });
    const surface = renderBrowserSelfHealingApplySurface({ plan });

    expect(plan.target).toBe("cache");
    expect(plan.applied).toBe(false);
    expect(plan.browserActionExecuted).toBe(false);
    expect(plan.replayExecuted).toBe(false);
    expect(surface).toContain("Browser self-healing apply");
    expect(surface).toContain("Browser executed: no");
  });

  it("infers proposal kind from deterministic proposal ids", () => {
    expect(inferBrowserSelfHealingProposalKindFromId("browser-self-healing-proposal:x:missing-runner-binding")).toBe("add-runner-binding");
    expect(inferBrowserSelfHealingProposalKindFromId("browser-self-healing-proposal:x:external-url-blocked")).toBe("external-network-blocked");
  });
});
