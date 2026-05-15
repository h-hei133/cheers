import { describe, expect, it } from "vitest";
import type { CompactContinuityPacket } from "./compactContinuityPacket.js";
import { applyCompactRedactionPolicy } from "./compactRedactionPolicy.js";

describe("compact redaction policy", () => {
  it("removes raw content fields, redacts secrets, and preserves references deterministically", () => {
    const packet = basePacket({
      recovery: {
        ...basePacket().recovery,
        recoveryAuthorityReferences: ["authority-1"],
      },
      editCapability: {
        ...basePacket().editCapability,
        blockedByDesign: [{ id: "automatic-recovery", reason: "explicit restore only" }],
      },
      evidence: ["Bearer SECRET_TOKEN_123456"],
    });

    const first = applyCompactRedactionPolicy({
      packet,
      secretValues: ["SECRET_TOKEN_123456"],
      unsafeInputs: {
        rawOriginalContent: "raw file body",
        nested: {
          recoveryAuthorityContent: "raw recovery blob",
        },
      },
    }).packet;
    const second = applyCompactRedactionPolicy({
      packet,
      secretValues: ["SECRET_TOKEN_123456"],
      unsafeInputs: {
        rawOriginalContent: "raw file body",
        nested: {
          recoveryAuthorityContent: "raw recovery blob",
        },
      },
    }).packet;
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(serialized).not.toContain("raw file body");
    expect(serialized).not.toContain("raw recovery blob");
    expect(serialized).not.toContain("SECRET_TOKEN_123456");
    expect(first.recovery.recoveryAuthorityReferences).toEqual(["authority-1"]);
    expect(first.editCapability.blockedByDesign).toEqual([
      { id: "automatic-recovery", reason: "explicit restore only" },
    ]);
    expect(first.redactions.map((entry) => entry.inputField)).toEqual(
      expect.arrayContaining([
        "unsafeInputs.rawOriginalContent",
        "unsafeInputs.nested.recoveryAuthorityContent",
        "packet.evidence[0]",
      ]),
    );
  });
});

function basePacket(
  overrides: Partial<CompactContinuityPacket> = {},
): CompactContinuityPacket {
  return {
    packetVersion: "compact-v2",
    generatedAt: "2026-05-15T00:00:00.000Z",
    source: "route-handoff",
    taskGoal: { constraints: [], unresolvedBlockers: [] },
    route: { stopConditions: [], forbiddenScope: [] },
    project: { repositoryHints: [] },
    editCapability: {
      supportedDefault: [],
      supportedNonDefault: [],
      explicitOptInOnly: [],
      blockedByDesign: [],
      automaticRecovery: false,
      atomicRollback: false,
    },
    mutationEvidence: {
      plannedFiles: [],
      changedFiles: [],
      failedFiles: [],
      writerFlags: [],
    },
    recovery: {
      restoreAvailable: false,
      restorePreviewAvailable: false,
      restoreExecuteExplicitOnly: true,
      recoveryAuthorityReferences: [],
      restorableFiles: [],
      blockedFiles: [],
      automaticRecoveryAvailable: false,
      atomicRollbackAvailable: false,
      recoveryExecuted: false,
    },
    validation: {
      testsRun: [],
      verifierStatus: [],
    },
    context: {
      compactSurvivorFacts: [],
      memoryCandidates: [],
      sidebarFacts: [],
      startupWarmCandidates: [],
    },
    redactions: [],
    warnings: [],
    evidence: [],
    ...overrides,
  };
}

