import { describe, expect, it } from "vitest";
import { planGeneratedEdit } from "./generatedEditPlanner.js";

describe("generatedEditPlanner", () => {
  it("creates a no-write proposal for vague generated content", () => {
    const plan = planGeneratedEdit({
      prompt: "Generate a better implementation for src/app.ts",
      targetPath: "src/app.ts",
    });

    expect(plan.status).toBe("proposal-created-no-write");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.mutation).toBe("not-run");
    expect(plan.mutationAuthority).toBe("not-granted");
    expect(plan.handoffLane).toBe("none");
    expect(plan.evidence).toContain("generated-edit-planner:mutation:not-run");
  });

  it("stops missing generated content without handoff or mutation", () => {
    const plan = planGeneratedEdit({
      prompt: "Replace the implementation in src/app.ts",
      targetPath: "src/app.ts",
    });

    expect(plan.status).toBe("missing-generated-content");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.handoffLane).toBe("none");
    expect(plan.evidence).toContain(
      "generated-edit-planner:missing-explicit-content",
    );
  });

  it("stops provider-generated content as unsupported mutation authority", () => {
    const plan = planGeneratedEdit({
      prompt: "Generate replacement content for src/app.ts",
      targetPath: "src/app.ts",
      providerGeneratedContent: true,
    });

    expect(plan.status).toBe("unsupported-provider-generated-request");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.handoffLane).toBe("none");
    expect(plan.evidence).toContain(
      "generated-edit-planner:provider-generated-unsupported",
    );
  });

  it.each([
    ["Refactor all files across the repo", "broad-generated-request"],
    ["Use the closest similar block in src/app.ts", "fuzzy-generated-request"],
    ["Find the file and generate the replacement", "generated-discovery-request"],
  ] as const)("stops unsupported generated request: %s", (prompt, status) => {
    const plan = planGeneratedEdit({ prompt });

    expect(plan.status).toBe(status);
    expect(plan.changedFiles).toEqual([]);
    expect(plan.handoffLane).toBe("none");
    expect(plan.evidence).toContain("generated-edit-planner:raw-content-excluded");
  });

  it("marks exact single-target proposals ready only after explicit confirmation", () => {
    const prompt = [
      "Generate proposal for src/app.ts, confirmed target src/app.ts.",
      "```",
      "old line",
      "```",
      "```",
      "new line",
      "```",
    ].join("\n");

    const unconfirmed = planGeneratedEdit({
      prompt,
      candidateTargets: ["src/app.ts"],
    });
    expect(unconfirmed.status).toBe("exact-single-target-proposal");
    expect(unconfirmed.handoffLane).toBe("none");

    const confirmed = planGeneratedEdit({
      prompt,
      targetPath: "src/app.ts",
      confirmationTargetPath: "src/app.ts",
    });
    expect(confirmed.status).toBe("ready-for-exact-handoff");
    expect(confirmed.handoffLane).toBe("existing-fenced-replacement");
    expect(confirmed.changedFiles).toEqual([]);
    expect(confirmed.evidence).toContain(
      "generated-edit-planner:ready-for-existing-fenced-route",
    );
  });

  it("marks confirmed target-set proposals ready for the existing target-set lane", () => {
    const prompt = [
      "Generated target-set proposal.",
      "```",
      "old line",
      "```",
      "```",
      "new line",
      "```",
    ].join("\n");

    const plan = planGeneratedEdit({
      prompt,
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
    });

    expect(plan.status).toBe("ready-for-exact-handoff");
    expect(plan.handoffLane).toBe("existing-target-set-edit");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.evidence).toContain(
      "generated-edit-planner:ready-for-existing-target-set-route",
    );
  });
});
