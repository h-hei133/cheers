import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchDryRun } from "./singleFileApplyPatchDryRun.js";
import { buildSingleFileApplyPatchStaleReadContract } from "./singleFileApplyPatchStaleRead.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch dry-run stale evidence chain", () => {
  it("uses dry-run base evidence to prove unchanged content remains contract-ready without write readiness", () => {
    const dryRunResult = dryRun({
      "src/app.ts": "old\n",
    });

    expect(dryRunResult.status).toBe("dry-run-ready");
    expect(dryRunResult.baseEvidence).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        digestAlgorithm: "sha256",
        capturedAtPhase: "dry-run-preview",
        source: "verify-readFile",
      }),
    );
    expect(dryRunResult.baseEvidence?.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.prototype.hasOwnProperty.call(dryRunResult.baseEvidence, "baseContent"),
    ).toBe(false);

    const staleRead = buildSingleFileApplyPatchStaleReadContract({
      baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
      currentContent: "old\n",
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(staleRead.status).toBe("contract-ready");
    expect(staleRead.doesNotClaimProductionWriteReady).toBe(true);
    expectNoWriteProof(staleRead);
  });

  it("blocks the chain as stale-read when current content changed after dry-run preview", () => {
    const dryRunResult = dryRun({
      "src/app.ts": "old\n",
    });

    const staleRead = buildSingleFileApplyPatchStaleReadContract({
      baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
      currentContent: "changed\n",
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(staleRead.status).toBe("blocked");
    expect(staleRead.blocker).toBe("stale-read");
    expect(staleRead.writeDecisionBlocked).toBe(true);
    expectNoWriteProof(staleRead);
  });

  it("blocks the chain as target-missing when current content is absent before write decision", () => {
    const dryRunResult = dryRun({
      "src/app.ts": "old\n",
    });

    const staleRead = buildSingleFileApplyPatchStaleReadContract({
      baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
      currentContent: undefined,
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(staleRead.status).toBe("blocked");
    expect(staleRead.blocker).toBe("target-missing");
    expect(staleRead.writeDecisionBlocked).toBe(true);
    expectNoWriteProof(staleRead);
  });
});

function dryRun(
  files: Readonly<Record<string, string>>,
): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
  return buildSingleFileApplyPatchDryRun({
    workspaceRoot,
    rawPatchText: [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ].join("\n"),
    dryRun: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
  });
}

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type BaseEvidence = NonNullable<DryRunResult["baseEvidence"]>;
type StaleReadResult = ReturnType<
  typeof buildSingleFileApplyPatchStaleReadContract
>;

function expectBaseEvidence(
  baseEvidence: DryRunResult["baseEvidence"],
): BaseEvidence {
  if (!baseEvidence) {
    throw new Error("Expected dry-run base evidence");
  }
  return baseEvidence;
}

function expectNoWriteProof(result: StaleReadResult): void {
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
}
