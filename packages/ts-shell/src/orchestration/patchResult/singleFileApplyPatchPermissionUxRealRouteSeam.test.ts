import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "../../edit/patch/apply/optIn.js";
import {
  buildSingleFileApplyPatchPermissionUxRealRouteSeam,
  type SingleFileApplyPatchPermissionUxRealRouteSeam,
} from "./singleFileApplyPatchPermissionUxRealRouteSeam.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("single-file apply_patch permission UX real-route seam", () => {
  it("projects provider-facing pending permission through a safe no-write seam", () => {
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: routeResult("pending"),
      requestedUserDecision: "pending",
    });

    expect(seam.permissionStatus).toBe("pending");
    expect(seam.targetPath).toBe("src/app.ts");
    expect(seam.previewSummary).toContain("M src/app.ts");
    expect(seam.baseEvidenceDigestBound).toBe(true);
    expect(seam.staleReadPreconditionBound).toBe(true);
    expect(seam.approvalTokenPrepared).toBe(false);
    expect(seam.displayLines).toContain(
      "Waiting for explicit edit permission; no file was modified.",
    );
    expectNoWriteNoLeak(seam);
  });

  it("keeps requested approval as pending permission UX and never write authorization", () => {
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: routeResult("approved"),
      requestedUserDecision: "approved",
    });

    expect(seam.permissionStatus).toBe("pending");
    expect(seam.requestedUserDecision).toBe("approved");
    expect(seam.approvalReady).toBe(false);
    expect(seam.approvalTokenPrepared).toBe(true);
    expect(seam.approvalDoesNotAuthorizeWrite).toBe(true);
    expect(seam.safetyProof.noApprovalAsWriteAuthorization).toBe(true);
    expectNoWriteNoLeak(seam);
  });

  it("projects denied permission to a non-success no-write surface", () => {
    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: routeResult("denied"),
      requestedUserDecision: "denied",
    });

    expect(seam.permissionStatus).toBe("denied");
    expect(seam.approvalTokenPrepared).toBe(false);
    expect(seam.displayLines).toContain("Permission denied; no file was modified.");
    expect(seam.nextAction).toContain("Do not write");
    expectNoWriteNoLeak(seam);
  });

  it("blocks rejected production-adjacent routes before permission UX", () => {
    const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      readFile: () => {
        throw new Error("readFile must not run without opt-in");
      },
    });

    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult,
    });

    expect(seam.permissionStatus).toBe("blocked");
    expect(seam.blocker).toBe("route-not-ready");
    expect(seam.baseEvidenceDigestBound).toBe(false);
    expect(seam.staleReadPreconditionBound).toBe(false);
    expect(seam.nextAction).toContain("default production apply_patch rejected");
    expectNoWriteNoLeak(seam);
  });

  it("blocks stale-read route results without creating write readiness", () => {
    let reads = 0;
    const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: "approved",
      readFile: () => {
        reads += 1;
        return reads === 1 ? "old\n" : "changed\n";
      },
    });

    const seam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult,
      requestedUserDecision: "approved",
    });

    expect(seam.permissionStatus).toBe("blocked");
    expect(seam.blocker).toBe("permission-ux-blocked");
    expect(seam.approvalTokenPrepared).toBe(false);
    expect(seam.displayLines).toContain(
      "Permission path blocked before any write; no file was modified.",
    );
    expectNoWriteNoLeak(seam);
  });
});

function routeResult(
  requestedUserDecision: "pending" | "denied" | "approved",
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const result = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision,
    readFile: (absolutePath) => {
      expect(path.relative(workspaceRoot, absolutePath)).toBe("src/app.ts");
      return "old\n";
    },
  });
  if (result.explicitOptIn !== true) {
    throw new Error("Expected opt-in route result");
  }
  return result;
}

function expectNoWriteNoLeak(
  seam: SingleFileApplyPatchPermissionUxRealRouteSeam,
): void {
  expect(seam.willWrite).toBe(false);
  expect(seam.changedFiles).toEqual([]);
  expect(seam.writeIntents).toEqual([]);
  expect(seam.noWriterInvoked).toBe(true);
  expect(seam.noAppliedPatchRecord).toBe(true);
  expect(seam.doesNotClaimMutationSuccess).toBe(true);
  expect(seam.doesNotClaimWriteSuccess).toBe(true);
  expect(seam.rawProviderMetadataAccepted).toBe(false);
  expect(seam.rawApprovalMetadataAccepted).toBe(false);
  expect(seam.rawBaseContentAccepted).toBe(false);
  expect(seam.rawWriterBoundaryAccepted).toBe(false);
  expect(seam.permissionStatus).toMatch(/^(pending|denied|blocked)$/);
  expect(seam.permissionStatus).not.toBe("approved");
  expect(seam.safetyProof).toEqual(
    expect.objectContaining({
      noWriteAuthorization: true,
      noApprovalAsWriteAuthorization: true,
      noChangedFiles: true,
      noWriteIntents: true,
      noWriterInvocation: true,
      noAppliedPatch: true,
      noSuccessClaim: true,
      noRawProviderMetadata: true,
      noRawApprovalMetadata: true,
      noRawBaseContent: true,
      noRawWriterBoundary: true,
    }),
  );
  const serialized = JSON.stringify(seam).toLowerCase();
  expect(serialized).not.toContain("/home/wang/.private-agents-real");
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("old\n");
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("\"applied\"");
}
