import { describe, expect, it } from "vitest";
import { buildGeneratedEditProposalResult } from "./generatedEditResult.js";
import { planGeneratedEdit } from "./generatedEditPlanner.js";
import { deriveStoppedSessionContinuitySurface } from "../session/stoppedSessionContinuity.js";

describe("generatedEditResult", () => {
  it("projects proposal-created as stopped no-write result surface", () => {
    const plan = planGeneratedEdit({
      prompt: "Generate a better implementation for src/app.ts",
      targetPath: "src/app.ts",
    });

    const result = buildGeneratedEditProposalResult({
      sessionId: "session-generated-edit",
      prompt: "Generate a better implementation for src/app.ts",
      plan,
    });

    expect(result.terminalReason).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toContain(
      "generated-edit-result:mutation:not-run",
    );
    expect(result.codingResult?.evidence).toContain(
      "generated-edit-result:raw-content-excluded",
    );
    expect(result.finalOutput).toContain("mutation did not run");
    expect(result.finalOutput).not.toContain("old line");
  });

  it("keeps generated proposal facts available for continue without raw content", () => {
    const plan = planGeneratedEdit({
      prompt: "Generate a better implementation for src/app.ts",
      targetPath: "src/app.ts",
    });
    const result = buildGeneratedEditProposalResult({
      sessionId: "session-generated-edit",
      prompt: "Generate a better implementation for src/app.ts",
      plan,
    });
    const surface = deriveStoppedSessionContinuitySurface(result.codingResult);

    expect(surface?.kind).toBe("unsupported-future-edit");
    expect(surface?.failureHandoffDiagnostic).toContain(
      "generated=generated-edit proposal=",
    );
    expect(surface?.failureHandoffDiagnostic).toContain("raw-content-excluded");
    expect(surface?.failureHandoffDiagnostic).not.toContain("old line");
  });
});
