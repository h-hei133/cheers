import { describe, expect, it } from "vitest";

import {
  extractWorkflowTaskIntentSignals,
  isPostEditReadOnlyVerifyFollowUp,
  removeNegatedMutationInstructions,
} from "./workflowIntentSignals.js";

describe("workflowIntentSignals", () => {
  it("strips negated mutation wording before edit intent classification", () => {
    const stripped = removeNegatedMutationInstructions(
      "Read package.json. Do not edit or modify anything.",
    );

    expect(stripped).toBe("Read package.json.  ");

    const signals = extractWorkflowTaskIntentSignals(
      "Read package.json. Do not edit or modify anything.",
      {},
    );
    expect(signals.hasFileReadIntent).toBe(true);
    expect(signals.hasEditIntent).toBe(false);
  });

  it("keeps unsupported command intent as a planning fact only", () => {
    const signals = extractWorkflowTaskIntentSignals("Please run dir", {});

    expect(signals.hasExecutionIntent).toBe(true);
    expect(signals.unsupportedCommand).toBe("dir");
  });

  it("recognizes post-edit read-only verification without creating edit intent", () => {
    const prompt = "Verify it contains ready, but do not modify anything.";
    const signals = extractWorkflowTaskIntentSignals(prompt, {
      lastTaskKind: "edit-file",
    });

    expect(isPostEditReadOnlyVerifyFollowUp(prompt)).toBe(true);
    expect(signals.hasVerifyIntent).toBe(true);
    expect(signals.hasEditIntent).toBe(false);
  });
});
