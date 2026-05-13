import { describe, expect, it } from "vitest";
import {
  buildAmbiguousEditInstructionReason,
  formatEditExecutionFailure,
  formatTargetResolutionBlockerReason,
} from "./doNextProjection.js";

describe("do next projection", () => {
  it("formats edit execution failure with an explicit next action", () => {
    expect(
      formatEditExecutionFailure({
        failureReason: "patch-from-not-found",
        explanation: "Replace source text was not found.",
        nextAction: "Re-read the file and retry with exact current text.",
      }),
    ).toBe(
      "patch-from-not-found: Replace source text was not found. Next action: Re-read the file and retry with exact current text.",
    );
  });

  it("builds math-specific ambiguous edit guidance without claiming a write", () => {
    expect(buildAmbiguousEditInstructionReason("src/math.js")).toContain(
      "replace 'return n + 2;' with 'return n * 2;'",
    );
    expect(buildAmbiguousEditInstructionReason("src/math.js")).toContain(
      "No files were changed",
    );
  });

  it("formats target resolution blockers with candidates and next action", () => {
    expect(
      formatTargetResolutionBlockerReason({
        code: "ambiguous-target",
        reason: "Multiple files match the request.",
        candidates: ["src/a.ts", "src/b.ts"],
        nextAction: "Specify one exact target file.",
      }),
    ).toBe(
      "ambiguous-target: Multiple files match the request. Candidates: src/a.ts, src/b.ts. Next action: Specify one exact target file.",
    );
  });
});
