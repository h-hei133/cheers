import { describe, expect, it } from "vitest";
import {
  buildTargetSetEditPreflightJournal,
  projectTargetSetEditJournalEvidence,
} from "./targetSetEditJournal.js";
import type { TargetSetEditPlan } from "./targetSetEditPlan.js";

describe("targetSetEditJournal", () => {
  it("records safe preflight entries without raw content", () => {
    const journal = buildTargetSetEditPreflightJournal({
      transactionId: "target-set-txn-test",
      plan: readyPlan(),
    });

    expect(journal.map((entry) => entry.step)).toEqual([
      "preflight-started",
      "authority-checked",
      "match-count-checked",
      "preflight-passed",
    ]);
    expect(projectTargetSetEditJournalEvidence(journal)).toEqual(
      expect.arrayContaining([
        "target-set-edit-journal:safe",
        "target-set-edit-journal:raw-content-excluded",
        "target-set-edit-journal:preflight-passed",
      ]),
    );
    expect(JSON.stringify(journal)).not.toContain("status: draft");
    expect(JSON.stringify(journal)).not.toContain("status: ready");
  });

  it("records preflight failure as mutation not-run", () => {
    const journal = buildTargetSetEditPreflightJournal({
      transactionId: "target-set-txn-test",
      plan: blockedPlan(),
    });

    expect(journal.map((entry) => entry.step)).toEqual([
      "preflight-started",
      "preflight-failed",
    ]);
    expect(projectTargetSetEditJournalEvidence(journal)).toEqual(
      expect.arrayContaining([
        "target-set-edit-journal:preflight-failed:over-max-files",
        "target-set-edit-journal:mutation:not-run",
      ]),
    );
  });
});

function readyPlan(): TargetSetEditPlan {
  return {
    status: "ready",
    manifestId: "manifest-test",
    maxFiles: 3,
    targetCount: 1,
    redactionStatus: "raw-content-excluded",
    targets: [
      {
        targetPath: "src/a.ts",
        pathLabel: "src/a.ts",
        executionOrder: 1,
        plan: {
          ok: true,
          targetPath: "src/a.ts",
          rawPatchText: "[patch-excluded]",
          matchCount: 1,
          changedLines: 1,
          addedLines: 1,
          removedLines: 1,
          summary: "one exact replacement",
          evidence: ["fenced-edit-plan:exactly-one-match"],
        },
        workspaceAuthority: {
          ok: true,
          absolutePath: "/tmp/workspace/src/a.ts",
          realPath: "/tmp/workspace/src/a.ts",
        },
        staleReadRequirement: "final-stale-read-before-writer",
        snapshotRequirement: "pre-write-snapshot-before-writer",
        verificationRequirement: "post-write-verification",
        evidence: ["target-set-edit-plan:target:src/a.ts"],
      },
    ],
    evidence: ["target-set-edit-plan:all-targets-preflighted"],
  };
}

function blockedPlan(): TargetSetEditPlan {
  return {
    status: "blocked",
    manifestId: "manifest-test",
    maxFiles: 3,
    targetCount: 4,
    blocker: "over-max-files",
    reason: "Too many files.",
    nextAction: "Confirm at most three files.",
    redactionStatus: "raw-content-excluded",
    evidence: ["target-set-edit-plan:blocker:over-max-files"],
  };
}
