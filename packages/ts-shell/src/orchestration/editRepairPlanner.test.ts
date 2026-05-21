import { describe, expect, it } from "vitest";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { buildEditRepairContext } from "./editRepairContext.js";
import {
  planEditRepairHunkSetHandoff,
  planEditRepairProposal,
} from "./editRepairPlanner.js";

describe("editRepairPlanner", () => {
  it("creates fake-provider repair proposals without mutation or apply-time provider authority", async () => {
    const plan = await planEditRepairProposal({
      context: contextFixture(),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeRepair: () => ({
          hunks: [
            {
              hunkId: "repair-h1",
              targetPath: "src/app.ts",
              summary: "repair failing assertion",
              oldText: "old",
              newText: "new",
            },
          ],
        }),
      },
    });

    expect(plan.status).toBe("repair-review-required");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.mutationAuthority).toBe("not-granted");
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "edit-repair-planner:fake-provider-boundary-supported",
        "edit-repair-planner:no-provider-call-during-apply",
        "edit-repair-planner:mutation:not-run",
      ]),
    );
  });

  it("stops provider unavailable, opt-in, unsupported, and invalid states", async () => {
    for (const [availability, status] of [
      [{ kind: "not-configured" as const }, "repair-provider-not-configured"],
      [{ kind: "opt-in-required" as const }, "repair-provider-opt-in-required"],
      [{ kind: "unsupported" as const }, "repair-unsupported"],
      [{ kind: "request-blocked" as const }, "repair-unsupported"],
    ] as const) {
      const plan = await planEditRepairProposal({
        context: contextFixture(),
        availability,
      });
      expect(plan.status).toBe(status);
      expect(plan.changedFiles).toEqual([]);
      expect(plan.evidence).toContain("edit-repair-planner:mutation:not-run");
    }

    const invalid = await planEditRepairProposal({
      context: contextFixture(),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: { hunks: [{ targetPath: "src/other.ts", oldText: "a", newText: "b" }] },
    });
    expect(invalid.status).toBe("repair-proposal-invalid");
  });

  it("marks hunk-set handoff ready only after explicit repair confirmation", async () => {
    const plan = await planEditRepairProposal({
      context: contextFixture(),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [
          { hunkId: "h1", targetPath: "src/app.ts", oldText: "a", newText: "b" },
          { hunkId: "h2", targetPath: "src/app.ts", oldText: "c", newText: "d" },
        ],
      },
    });
    expect(plan.status).toBe("repair-review-required");
    if (!("manifest" in plan) || !plan.manifest) {
      throw new Error("expected manifest");
    }
    const review = buildEditRepairProposalReview(plan.manifest);
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });

    const handoff = planEditRepairHunkSetHandoff({ plan, selection });

    expect(handoff.status).toBe("repair-ready-for-hunk-set-handoff");
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.evidence).toContain(
      "edit-repair-planner:handoff:existing-hunk-set-route",
    );
  });
});

function contextFixture() {
  return buildEditRepairContext({
    verification: { status: "failed", reason: "verification failed" },
    failedFiles: [{ path: "src/app.ts" }],
    changedFiles: ["src/app.ts"],
  });
}
