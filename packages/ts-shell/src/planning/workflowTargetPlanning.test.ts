import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  resolveWorkflowTargetPlanning,
  shouldBlockMutationForTargetResolution,
} from "./workflowTargetPlanning.js";

describe("workflowTargetPlanning", () => {
  const workspaceRoot = path.resolve("/tmp/workflow-target-planning");

  it("uses verify-tail fallback for mutation target resolution", () => {
    const facts = resolveWorkflowTargetPlanning({
      prompt:
        "Edit note.txt. Then verify README.md and LOCKED.md are unchanged.",
      workspaceRoot,
      hasVerifyIntent: true,
    });

    expect(facts.targetResolution.primaryTarget?.cleaned).toBe("note.txt");
    expect(facts.targetResolution.blocker).toBeNull();
    expect(facts.hasExplicitPathReference).toBe(true);
  });

  it("preserves explicit path reference facts for path-only read planning", () => {
    const facts = resolveWorkflowTargetPlanning({
      prompt: "Read './src/widget.test.tsx' first 3 lines",
      workspaceRoot,
      hasVerifyIntent: false,
    });

    expect(facts.promptPathTarget?.cleaned).toBe("./src/widget.test.tsx");
    expect(facts.explicitPrimaryTarget?.cleaned).toBe(
      "./src/widget.test.tsx",
    );
    expect(facts.hasExplicitPathReference).toBe(true);
  });

  it("blocks ambiguous mutation targets only for mutation-like planning cues", () => {
    const blocker = {
      code: "ambiguous-target",
      reason: "ambiguous",
      nextAction: "choose one",
      candidates: ["src/a.ts", "src/b.ts"],
    } as const;

    expect(
      shouldBlockMutationForTargetResolution({
        blocker,
        hasCorrectionCue: false,
        hasCreateIntent: false,
        hasEditIntent: true,
        hasExecutionCorrectionCue: false,
        hasFencedContent: false,
        hasReplaceDirective: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockMutationForTargetResolution({
        blocker,
        hasCorrectionCue: false,
        hasCreateIntent: false,
        hasEditIntent: false,
        hasExecutionCorrectionCue: false,
        hasFencedContent: false,
        hasReplaceDirective: false,
      }),
    ).toBe(false);
  });
});
