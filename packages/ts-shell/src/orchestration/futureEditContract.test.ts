import { describe, expect, it } from "vitest";
import { classifyFutureEditContract } from "./futureEditContract.js";

describe("futureEditContract", () => {
  it("classifies broad refactor as future planning with no mutation", () => {
    const contract = classifyFutureEditContract({
      prompt: "Refactor auth helpers across the repo and keep usages working",
      hasEditIntent: true,
    });

    expect(contract).toMatchObject({
      mode: "future-broad-refactor-planning",
      supportStatus: "future-only",
      mutationAllowedNow: false,
      userConfirmationRequired: true,
      futureRoute: "route-148c-broad-refactor-manifest",
      receipt: {
        policy: "blocked",
        execution: "not-run",
        result: "stopped",
      },
    });
    expect(contract.requiredPreconditions).toEqual(
      expect.arrayContaining([
        "target-constraint-manifest",
        "user-confirmed-target-selection",
        "final-stale-read",
        "post-write-verification-plan",
        "snapshot-or-rollback-story",
      ]),
    );
  });

  it("requires candidate confirmation for multi-file discovery edit", () => {
    const contract = classifyFutureEditContract({
      prompt: "Edit this repository and replace v1 with v2",
      hasEditIntent: true,
    });

    expect(contract).toMatchObject({
      mode: "future-multi-file-discovery-edit",
      supportStatus: "future-only",
      mutationAllowedNow: false,
      userConfirmationRequired: true,
      futureRoute: "route-148b-discovery-target-selection",
    });
    expect(contract.requiredPreconditions).toEqual(
      expect.arrayContaining([
        "candidate-file-list",
        "user-confirmed-target-selection",
        "workspace-authority-check",
      ]),
    );
  });

  it("keeps broad fenced replacement future-only without exact mapping", () => {
    const contract = classifyFutureEditContract({
      prompt: ["Use this fenced replacement in src/app.ts:", "```", "new", "```"].join(
        "\n",
      ),
      targetPath: "src/app.ts",
      hasEditIntent: true,
      hasFencedContent: true,
    });

    expect(contract).toMatchObject({
      mode: "future-fenced-replacement",
      supportStatus: "future-only",
      mutationAllowedNow: false,
      futureRoute: "route-148a-fenced-replacement",
    });
    expect(contract.requiredPreconditions).toEqual(
      expect.arrayContaining(["explicit-target", "exact-old-new-mapping"]),
    );
  });

  it("stops vague create prompts instead of treating them as generated content", () => {
    const contract = classifyFutureEditContract({
      prompt: "Write src/new-widget.test.tsx",
      targetPath: "src/new-widget.test.tsx",
      hasCreateIntent: true,
    });

    expect(contract).toMatchObject({
      mode: "unsupported-generated-content",
      supportStatus: "unsupported",
      mutationAllowedNow: false,
      reasonCode: "unsupported-generated-content",
    });
    expect(contract.doNext).toContain("concrete content");
  });

  it("keeps bounded concrete writes and edits current-supported", () => {
    expect(
      classifyFutureEditContract({
        prompt: "Create file notes.txt with content: hello",
        targetPath: "notes.txt",
        hasCreateIntent: true,
        hasConcreteContent: true,
      }),
    ).toMatchObject({
      mode: "current-bounded-write",
      supportStatus: "current-supported",
      mutationAllowedNow: true,
    });

    expect(
      classifyFutureEditContract({
        prompt: "Edit src/app.ts and replace old with new",
        targetPath: "src/app.ts",
        hasEditIntent: true,
        hasReplaceDirective: true,
        hasExactOldNewMapping: true,
      }),
    ).toMatchObject({
      mode: "current-bounded-edit",
      supportStatus: "current-supported",
      mutationAllowedNow: true,
    });
  });

  it("projects future stopped results through replay-safe tool result text", () => {
    const contract = classifyFutureEditContract({
      prompt:
        "Refactor repo with token=secret and inspect /home/wang/.private-agents-real/config",
      hasEditIntent: true,
    });

    expect(contract.stoppedResult.terminalSummary).toContain("stopped");
    expect(contract.stoppedResult.terminalSummary).toContain("DoNext");
    expect(contract.stoppedResult.transcriptSummary).not.toContain(
      "/home/wang/.private-agents-real",
    );
    expect(contract.stoppedResult.transcriptSummary).not.toContain("secret");
    expect(contract.stoppedResult.evidence).toContain("mutation:not-run");
  });
});
