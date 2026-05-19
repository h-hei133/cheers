import { describe, expect, it } from "vitest";
import { planFutureEditExpansion } from "./futureEditPlanner.js";

describe("futureEditPlanner", () => {
  it("builds a no-op broad refactor plan with manifest and rollback requirements", () => {
    const plan = planFutureEditExpansion({
      prompt: "Refactor the logging API across the repo",
      hasEditIntent: true,
    });

    expect(plan).toMatchObject({
      mode: "future-broad-refactor-planning",
      requestedScope: "workspace",
      confirmationRequirement: "required-before-mutation",
      verificationRequirement: "required-before-future-execution",
      rollbackRequirement: "required-before-future-execution",
      mutationAllowedNow: false,
    });
    expect(plan.missingInformation).toEqual(
      expect.arrayContaining([
        "target-constraint-manifest",
        "user-confirmed-target-selection",
        "snapshot-or-rollback-story",
      ]),
    );
  });

  it("separates discovery target selection from mutation", () => {
    const plan = planFutureEditExpansion({
      prompt: "Edit this workspace and update all deprecated imports",
      hasEditIntent: true,
    });

    expect(plan).toMatchObject({
      mode: "future-multi-file-discovery-edit",
      requestedScope: "workspace",
      confirmationRequirement: "required-before-target-selection",
      mutationAllowedNow: false,
    });
    expect(plan.missingInformation).toEqual(
      expect.arrayContaining(["candidate-file-list"]),
    );
  });

  it("requires exact fenced replacement mapping and keeps mutation disabled", () => {
    const plan = planFutureEditExpansion({
      prompt: ["Replace this block in src/app.ts:", "```", "next", "```"].join(
        "\n",
      ),
      targetPath: "src/app.ts",
      hasEditIntent: true,
      hasFencedContent: true,
    });

    expect(plan).toMatchObject({
      mode: "future-fenced-replacement",
      requestedScope: "single-file",
      targetHints: ["src/app.ts"],
      mutationAllowedNow: false,
    });
    expect(plan.missingInformation).toEqual(
      expect.arrayContaining(["exact-old-new-mapping", "final-stale-read"]),
    );
  });

  it("does not expose writer, patch engine, provider, or browser execution hooks", () => {
    const plan = planFutureEditExpansion({
      prompt: "Edit this repository and replace alpha with beta",
      hasEditIntent: true,
    });

    expect(plan).not.toHaveProperty("writeFile");
    expect(plan).not.toHaveProperty("applyPatch");
    expect(plan).not.toHaveProperty("provider");
    expect(plan).not.toHaveProperty("browser");
    expect(plan).not.toHaveProperty("execute");
    expect(plan.mutationAllowedNow).toBe(false);
  });
});
