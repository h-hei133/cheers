import { describe, expect, it } from "vitest";
import {
  planProviderEditProposal,
  providerReadinessFailureToEditAvailability,
} from "./providerEditPlanner.js";

describe("providerEditPlanner", () => {
  it("creates a fake-provider exact proposal without mutation", async () => {
    const plan = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      targets: [{ path: "src/app.ts", readSummary: "function oldName() {}" }],
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/app.ts",
              summary: "rename oldName to newName",
              oldText: "oldName",
              newText: "newName",
            },
          ],
        }),
      },
    });

    expect(plan.status).toBe("provider-proposal-ready");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.mutationAuthority).toBe("not-granted");
    expect(plan.mutation).toBe("not-run");
    expect(plan.manifest.handoffReadiness).toBe("exact-single-target");
    expect(plan.evidence).toContain("provider-edit-planner:mutation:not-run");
  });

  it("stops provider not configured, opt-in required, unsupported, and blocked", async () => {
    for (const [availability, status] of [
      [{ kind: "not-configured" as const }, "provider-not-configured"],
      [{ kind: "opt-in-required" as const }, "provider-opt-in-required"],
      [{ kind: "unsupported" as const }, "provider-unsupported"],
      [{ kind: "request-blocked" as const }, "provider-request-blocked"],
    ] as const) {
      const plan = await planProviderEditProposal({
        availability,
        targets: [{ path: "src/app.ts", readSummary: "summary" }],
      });
      expect(plan.status).toBe(status);
      expect(plan.changedFiles).toEqual([]);
      expect(plan.evidence).toContain("provider-edit-planner:mutation:not-run");
    }
  });

  it("stops missing and over-budget context before provider calls", async () => {
    let callCount = 0;
    const provider = {
      proposeEdit: () => {
        callCount += 1;
        return { operationKind: "generated-replacement" as const };
      },
    };

    const missing = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });
    const overBudget = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      targets: [{ path: "a.ts" }, { path: "b.ts" }],
      maxTargets: 1,
      provider,
    });

    expect(missing.status).toBe("provider-context-missing");
    expect(overBudget.status).toBe("provider-context-over-budget");
    expect(callCount).toBe(0);
  });

  it("stops invalid provider proposals no-write", async () => {
    const plan = await planProviderEditProposal({
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      targets: [{ path: "src/app.ts", readSummary: "summary" }],
      provider: {
        proposeEdit: () => ({
          operationKind: "fuzzy-replacement",
          targets: [{ path: "src/app.ts" }],
        }),
      },
    });

    expect(plan.status).toBe("provider-proposal-invalid");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.evidence).toContain("provider-edit-proposal:invalid");
  });

  it("maps provider readiness failures into edit availability states", () => {
    expect(providerReadinessFailureToEditAvailability("missing-key").kind).toBe(
      "not-configured",
    );
    expect(
      providerReadinessFailureToEditAvailability("unsupported-provider").kind,
    ).toBe("unsupported");
    expect(providerReadinessFailureToEditAvailability("network").kind).toBe(
      "request-blocked",
    );
  });
});
