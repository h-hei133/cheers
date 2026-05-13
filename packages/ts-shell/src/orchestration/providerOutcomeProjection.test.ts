import { describe, expect, it } from "vitest";
import {
  formatProviderOutcomeFacts,
  projectProviderOutcome,
  projectProviderSafeDiagnostics,
} from "./providerOutcomeProjection.js";

describe("provider outcome projection", () => {
  it("projects failure handoff diagnostics before success diagnostics", () => {
    const projection = projectProviderOutcome({
      lastFailureHandoffDiagnostic:
        "failure: status=blocked; target=.\\src\\app.ts; command=npm test -- --help; reason=approval needed; blocker=approval-denied",
      lastSuccessHandoffDiagnostic:
        "success: status=passed; target=src/other.ts",
    });

    expect(projection.diagnosticHandoff).toEqual({
      kind: "failure",
      status: "blocked",
      target: ".\\src\\app.ts",
      command: "npm test -- --help",
      reason: "approval needed",
      blockerKind: "approval-denied",
    });
    expect(projection.lineage).toEqual([
      "diagnosticHandoff=failure",
      "diagnosticStatus=blocked",
      "diagnosticTarget=src/app.ts",
      "diagnosticCommandInherited=yes",
      "diagnosticReason=yes",
      "diagnosticBlocker=approval-denied",
    ]);
  });

  it("falls back to success diagnostics and ignores empty payloads", () => {
    expect(
      projectProviderSafeDiagnostics({
        lastFailureHandoffDiagnostic: "failure: ignored",
        lastSuccessHandoffDiagnostic: "success: status=passed; file=src/a.ts",
      }),
    ).toEqual({
      kind: "success",
      status: "passed",
      target: "src/a.ts",
    });
  });

  it("formats stable safe diagnostic facts without exposing raw detail", () => {
    expect(
      formatProviderOutcomeFacts({
        kind: "success",
        status: "PASSED",
        target: "./src/a.ts",
      }),
    ).toEqual([
      "diagnosticHandoff=success",
      "diagnosticStatus=passed",
      "diagnosticTarget=src/a.ts",
    ]);
  });
});
