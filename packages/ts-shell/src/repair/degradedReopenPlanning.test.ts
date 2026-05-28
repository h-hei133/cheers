import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasDegradedContinuationEvidenceInState,
  isAtypicalReopenFollowUpPrompt,
  isDegradedReopenFollowUpPrompt,
  resolveContinuationReopenTarget,
} from "./degradedReopenPlanning.js";

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "degraded-reopen-"));
}

describe("degradedReopenPlanning", () => {
  it("detects degraded evidence and reopen follow-up cues", () => {
    expect(
      hasDegradedContinuationEvidenceInState({
        lastContinuationEvidence: ["repair-outcome:degraded-terminal"],
      }),
    ).toBe(true);
    expect(isAtypicalReopenFollowUpPrompt("use the previous failure")).toBe(
      true,
    );
    expect(isDegradedReopenFollowUpPrompt("继续修")).toBe(true);
  });

  it("recovers a single remaining target and records source", () => {
    const workspaceRoot = makeWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, "src"));
    fs.writeFileSync(path.join(workspaceRoot, "src/a.ts"), "export {};");

    expect(
      resolveContinuationReopenTarget({
        continuity: {
          lastContinuationEvidence: ["repair-remaining-files: src/a.ts"],
        },
        prompt: "continue repairing it",
        workspaceRoot,
        enabled: true,
        degradedOnly: true,
      }),
    ).toMatchObject({
      enabled: true,
      selectedTarget: "src/a.ts",
      selectedTargetExists: true,
      candidates: ["src/a.ts"],
      candidateSourceSummary: "remaining=1",
    });
  });

  it("keeps ambiguity explicit across multiple candidates", () => {
    const workspaceRoot = makeWorkspace();

    expect(
      resolveContinuationReopenTarget({
        continuity: {
          lastContinuationEvidence: [
            "repair-remaining-files: src/a.ts, src/b.ts",
          ],
        },
        prompt: "continue repairing it",
        workspaceRoot,
        enabled: true,
        degradedOnly: false,
      }),
    ).toMatchObject({
      enabled: true,
      candidates: ["src/a.ts", "src/b.ts"],
      reason:
        "continuation reopen remains ambiguous across multiple candidates; explicit target required",
    });
  });

  it("reports pruned candidates without selecting processed or directory targets", () => {
    const workspaceRoot = makeWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, "src/dir.ts"));

    expect(
      resolveContinuationReopenTarget({
        continuity: {
          lastContinuationEvidence: [
            "repair-remaining-files: ../escape.ts, src/processed.ts, src/dir.ts, src/a.ts, src/a.ts",
            "repair-processed-files: src/processed.ts",
          ],
        },
        prompt: "continue repairing it",
        workspaceRoot,
        enabled: true,
        degradedOnly: false,
      }),
    ).toMatchObject({
      enabled: true,
      selectedTarget: "src/a.ts",
      candidates: ["src/a.ts"],
      prunedCandidateSummary: [
        "../escape.ts::outside-workspace",
        "src/processed.ts::already-processed",
        "src/dir.ts::directory-target",
        "src/a.ts::duplicate",
      ],
    });
  });
});
