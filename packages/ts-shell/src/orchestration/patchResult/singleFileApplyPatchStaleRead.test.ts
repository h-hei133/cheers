import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchStaleReadContract } from "./singleFileApplyPatchStaleRead.js";

describe("buildSingleFileApplyPatchStaleReadContract", () => {
  it("marks unchanged target content contract-ready without write readiness", () => {
    const result = buildSingleFileApplyPatchStaleReadContract({
      targetPath: "src/app.ts",
      baseContent: "old\n",
      currentContent: "old\n",
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(result.status).toBe("contract-ready");
    expect(result.staleReadDetected).toBe(false);
    expect(result.writeDecisionBlocked).toBe(false);
    expect(result.blocker).toBeUndefined();
    expectNoWriteProof(result);
    expect(result.doesNotClaimProductionWriteReady).toBe(true);
    expect(result.nextAction).toContain("not production-write-ready");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-stale-read:contract-ready",
        "apply-patch-stale-read:base-content-matches-current-content",
        "apply-patch-stale-read:not-production-write-ready",
      ]),
    );
  });

  it("blocks write decision when target content changed after preview", () => {
    const result = buildSingleFileApplyPatchStaleReadContract({
      targetPath: "src/app.ts",
      baseContent: "old\n",
      currentContent: "changed\n",
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(result.status).toBe("blocked");
    expect(result.staleReadDetected).toBe(true);
    expect(result.writeDecisionBlocked).toBe(true);
    expect(result.blocker).toBe("stale-read");
    expect(result.reason).toContain("changed after the dry-run preview");
    expect(result.nextAction).toContain("Re-read the target file");
    expectNoWriteProof(result);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-stale-read:stale-read-detected",
        "apply-patch-stale-read:write-decision-blocked",
        "apply-patch-stale-read:not-production-write-ready",
      ]),
    );
  });

  it("blocks write decision when the target is missing", () => {
    const result = buildSingleFileApplyPatchStaleReadContract({
      targetPath: "src/missing.ts",
      baseContent: "old\n",
      currentContent: undefined,
      phase: "write-decision-dry-run",
      dryRun: true,
    });

    expect(result.status).toBe("blocked");
    expect(result.staleReadDetected).toBe(true);
    expect(result.writeDecisionBlocked).toBe(true);
    expect(result.blocker).toBe("target-missing");
    expect(result.reason).toContain("missing before the write decision");
    expect(result.nextAction).toContain("Re-read the workspace");
    expectNoWriteProof(result);
  });
});

type StaleReadResult = ReturnType<
  typeof buildSingleFileApplyPatchStaleReadContract
>;

function expectNoWriteProof(result: StaleReadResult): void {
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
}
