import { describe, expect, it } from "vitest";
import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "../../orchestration/patchResult/editCapabilityCloseoutManifest.js";
import { listEditCapabilityReadiness } from "../../orchestration/patchResult/editCapabilityReadiness.js";
import { renderCompactHandoffMarkdown } from "./compactHandoffRenderer.js";
import { buildRouteContinuityHandoffPacket } from "./routeContinuityHandoff.js";

describe("compact handoff renderer", () => {
  it("renders compact-safe markdown sections without raw sensitive content", () => {
    const packet = buildRouteContinuityHandoffPacket({
      generatedAt: "2026-05-15T00:00:00.000Z",
      source: "compact",
      route: {
        routeId: "75",
        name: "Compact v2 route continuity",
        nextAction: "Continue with Route 76 session integration.",
        stopConditions: ["broad lifecycle rewrite"],
        forbiddenScope: ["provider/MCP", "raw recovery content"],
      },
      taskGoal: {
        objective: "Preserve route continuity through compact.",
        constraints: ["no secrets"],
        nextAction: "Continue with Route 76 session integration.",
      },
      editCapabilityCloseoutManifest: EDIT_CAPABILITY_CLOSEOUT_MANIFEST,
      editCapabilityReadiness: listEditCapabilityReadiness(),
      contextProjectionInput: {
        mutationEvidence: {
          plannedFiles: ["src/a.ts"],
          changedFiles: ["src/b.ts"],
          failedFiles: [{ path: "src/c.ts", reason: "verification-failed" }],
          postWriteVerification: "passed",
          writerFlags: ["writer-started"],
        },
      },
      recoverySurfaceSummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/b.ts"],
        blockedFiles: [{ path: "src/c.ts", reason: "current-content-guard" }],
        recoveryAuthorityId: "authority-render",
        recoveryAction: "preview-restore",
        userFacingMessage: "Preview only.",
        evidence: ["explicit-restore-only"],
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validation: {
        testsRun: ["src/core/context"],
        verifierResults: [{ command: "rtk npm run test", status: "passed" }],
        buildStatus: "passed",
        resultContractStatus: "passed",
        fullCommandOutput: "SECRET_OUTPUT",
      },
      secretValues: ["SECRET_OUTPUT"],
    });
    const markdown = renderCompactHandoffMarkdown(packet);

    for (const heading of [
      "## Current task / route",
      "## Project state",
      "## Supported edit capability envelope",
      "## Blocked-by-design capabilities",
      "## Mutation evidence",
      "## Recovery / restore state",
      "## Validation evidence",
      "## Constraints / forbidden scope",
      "## Next action",
      "## Redactions / warnings",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("bounded-broad-patch-safe-subset");
    expect(markdown).toContain("restore-preview");
    expect(markdown).toContain("arbitrary-broad-apply-patch");
    expect(markdown).toContain("fuzzy-patch");
    expect(markdown).toContain("automatic-recovery");
    expect(markdown).toContain("atomic-rollback");
    expect(markdown).toContain("authority-render");
    expect(markdown).toContain("explicit-only");
    expect(markdown).toContain("Continue with Route 76 session integration.");
    expect(markdown).not.toContain("RAW_RECOVERY_CONTENT");
    expect(markdown).not.toContain("SECRET_OUTPUT");
    expect(markdown).not.toContain("chain-of-thought");
  });
});

