import { describe, expect, it } from "vitest";
import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "../../../edit/result/editCapabilityCloseoutManifest.js";
import { projectRecoverySurfaceSummary } from "../../../edit/recovery/recoverySurfaceProjection.js";
import type { RecoveryAuthorityCaptureBatchResult } from "../../../edit/recovery/recoveryAuthorityStore.js";
import {
  projectContextState,
  type ContextProjectionFact,
} from "./contextStateProjection.js";

describe("context state projection", () => {
  it("projects Route 73 edit closeout facts as compact-safe machine-readable state", () => {
    const projection = projectContextState({
      editCapabilityCloseoutManifest: EDIT_CAPABILITY_CLOSEOUT_MANIFEST,
    });
    const edit = fact(projection.compactSurvivorFacts, "edit-closeout-status");

    expect(edit.value).toEqual(
      expect.objectContaining({
        status: "closeout-candidate",
        boundedCap: 32,
        arbitraryBroadApplyPatch: "blocked-by-design",
        automaticRecovery: false,
        atomicRollback: false,
      }),
    );
    expect(valueArray(edit, "defaultReadyCapabilityIds")).toEqual(
      expect.arrayContaining([
        "bounded-broad-patch-safe-subset",
        "fenced-bounded-broad-patch-safe-subset",
        "bounded-mixed-2-32",
      ]),
    );
    expect(valueArray(edit, "blockedCapabilityIds")).toEqual(
      expect.arrayContaining([
        "arbitrary-broad-apply-patch",
        "fuzzy-patch",
        "automatic-recovery",
        "atomic-rollback",
      ]),
    );
  });

  it("preserves mutation evidence including writer flags and post-write verification", () => {
    const projection = projectContextState({
      mutationEvidence: {
        plannedFiles: ["src/a.ts"],
        changedFiles: ["src/b.ts"],
        failedFiles: [{ path: "src/c.ts", reason: "post-write-verification" }],
        postWriteVerification: "failed",
        writerStarted: true,
        writeEffect: "unverified",
        writerFlags: ["writer-started", "delete-move-started"],
      },
    });
    const mutation = fact(projection.compactSurvivorFacts, "mutation-evidence");

    expect(mutation.value).toEqual(
      expect.objectContaining({
        plannedFiles: ["src/a.ts"],
        changedFiles: ["src/b.ts"],
        failedFiles: [{ path: "src/c.ts", reason: "post-write-verification" }],
        postWriteVerification: "failed",
        writerStarted: true,
        writeEffect: "unverified",
        writerFlags: ["writer-started", "delete-move-started"],
      }),
    );
    expect(fact(projection.sidebarFacts, "mutation-sidebar").value).toEqual(
      expect.objectContaining({
        changedFiles: ["src/b.ts"],
        failedFiles: [{ path: "src/c.ts", reason: "post-write-verification" }],
      }),
    );
  });

  it("projects recovery facts safely from the recovery surface summary", () => {
    const recoverySummary = projectRecoverySurfaceSummary({
      routeId: "route74",
      recoveryAuthorityCapture: capturedAuthority(),
    });
    const projection = projectContextState({ recoverySummary });
    const recovery = fact(
      projection.compactSurvivorFacts,
      "recovery-restore-summary",
    );

    expect(recovery.value).toEqual(
      expect.objectContaining({
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/a.ts"],
        recoveryAuthorityId: "ctx-authority",
      }),
    );
    expect(JSON.stringify(projection)).not.toContain("original secret content");
  });

  it("preserves blocked recovery guard summaries without exposing raw content", () => {
    const projection = projectContextState({
      recoverySummary: {
        recoveryAvailable: false,
        explicitRestoreAvailable: false,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: [],
        blockedFiles: [
          { path: "src/a.ts", reason: "hidden-user-edit-guard" },
        ],
        recoveryAuthorityId: "ctx-authority",
        recoveryAction: "inspect-authority",
        rawOriginalContent: "raw before content",
      },
    });
    const recovery = fact(
      projection.compactSurvivorFacts,
      "recovery-restore-summary",
    );

    expect(recovery.value).toEqual(
      expect.objectContaining({
        blockedFiles: [{ path: "src/a.ts", reason: "hidden-user-edit-guard" }],
        recoveryAuthorityId: "ctx-authority",
      }),
    );
    expect(projection.redactions).toEqual(
      expect.arrayContaining([
        {
          inputField: "recoverySummary.rawOriginalContent",
          reason: "raw recovery authority content must not survive compact",
        },
      ]),
    );
    expect(JSON.stringify(projection)).not.toContain("raw before content");
  });

  it("redacts raw content, secrets, and full command output while keeping summaries", () => {
    const projection = projectContextState({
      mutationEvidence: {
        rawOriginalContent: "SECRET_RAW_ORIGINAL",
        rawFileDump: "large raw dump",
      },
      validationEvidence: {
        testsRun: ["contextStateProjection.test.ts"],
        verifierResults: [{ command: "rtk npm run test", status: "passed" }],
        fullCommandOutput: "SECRET_TOKEN=abc\nline 2\n",
      },
      secretValues: ["abc"],
    });
    const serialized = JSON.stringify(projection);
    const validation = fact(
      projection.compactSurvivorFacts,
      "validation-evidence",
    );

    expect(serialized).not.toContain("SECRET_RAW_ORIGINAL");
    expect(serialized).not.toContain("SECRET_TOKEN");
    expect(serialized).not.toContain("large raw dump");
    expect(serialized).not.toContain("abc");
    expect(validation.value).toEqual(
      expect.objectContaining({
        commandOutputSummary: "omitted full command output (2 non-empty lines, 24 bytes)",
      }),
    );
    expect(projection.redactions.map((entry) => entry.inputField)).toEqual(
      expect.arrayContaining([
        "mutationEvidence.rawOriginalContent",
        "mutationEvidence.rawFileDump",
        "validationEvidence.fullCommandOutput",
        "secretValues",
      ]),
    );
  });

  it("separates memory candidates, route transient facts, sidebar facts, and startup candidates", () => {
    const projection = projectContextState({
      routeInfo: { routeId: "74", title: "context engineering", status: "active" },
      projectInfo: {
        projectRoot: "/home/wang/projects/cheer",
        safeToPersistProjectRoot: true,
        projectFacts: ["TypeScript control plane"],
      },
      editCapabilityCloseoutManifest: EDIT_CAPABILITY_CLOSEOUT_MANIFEST,
      toolAvailabilitySummary: {
        tools: ["read"],
        mcp: ["placeholder-only"],
        skills: ["context-projection"],
      },
    });

    expect(projection.memoryCandidates.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "project-facts-memory-candidate",
        "blocked-edit-capability-memory-candidate",
      ]),
    );
    expect(projection.memoryCandidates.map((entry) => entry.id)).not.toContain(
      "route-info",
    );
    expect(projection.sidebarFacts.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "edit-blocked-sidebar",
        "tool-availability-sidebar",
      ]),
    );
    expect(projection.startupWarmCandidates.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["startup-project-root", "startup-edit-closeout"]),
    );
    expect(fact(projection.sidebarFacts, "tool-availability-sidebar").value).toEqual(
      expect.objectContaining({ discoveryImplemented: false }),
    );
  });
});

function fact(
  entries: readonly ContextProjectionFact[],
  id: string,
): ContextProjectionFact {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Missing context projection fact: ${id}`);
  }
  return entry;
}

function valueArray(entry: ContextProjectionFact, key: string): readonly string[] {
  const value = entry.value as Record<string, unknown>;
  const arrayValue = value[key];
  if (!Array.isArray(arrayValue)) {
    throw new Error(`Expected array value for ${key}`);
  }
  return arrayValue;
}

function capturedAuthority(): RecoveryAuthorityCaptureBatchResult {
  return {
    status: "captured",
    records: [
      {
        schemaVersion: 1,
        authorityId: "ctx-authority",
        recordId: "update-a",
        workspaceRelativePath: "src/a.ts",
        operationKind: "update",
        beforeState: "exists",
        beforeContentHash: "hash",
        beforeContentSizeBytes: 23,
        beforeContentRef: "blobs/hash.content",
        expectedCurrentState: "exists",
        expectedCurrentContentHash: "after-hash",
        capturedAtPhase: "pre-write",
        persistence: "non-default",
        createdAt: "2026-05-15T00:00:00.000Z",
        evidence: ["record-only"],
      },
    ],
    evidence: ["original secret content was written only to non-default blob"],
  };
}
