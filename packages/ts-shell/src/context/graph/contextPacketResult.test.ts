import { describe, expect, it } from "vitest";

import { projectContextPacketRuntimeOutcome } from "./contextPacketResult.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("projectContextPacketRuntimeOutcome", () => {
  it("projects replay-safe context evidence to a stopped read-only result when context is missing", () => {
    const packet: TargetedContextPacket = {
      packetId: "ctx_missing",
      rootTargetFile: "src/target.ts",
      targetSafeLabel: "src/target.ts",
      targetKind: "explicit-code-target",
      readBudget: {
        maxCandidateCount: 1,
        maxFilesRead: 1,
        maxBytesPerFile: 10,
        maxTotalBytes: 10,
        filesRead: 1,
        bytesUsed: 5,
      },
      contextSources: [],
      selectedCandidateSummaries: [
        {
          kind: "target-file-summary",
          pathLabel: "src/target.ts",
          relation: "explicit target",
          status: "included",
          summary: "lines=1",
          byteLength: 5,
          redactionApplied: false,
        },
      ],
      omittedCandidateSummaries: [],
      confidence: "low",
      completenessStatus: "missing-context",
      freshnessFacts: [],
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-packet ctx_missing; mutationAuthority=not-granted",
      mutationAuthority: "not-granted",
      evidence: ["context-packet:mutation-authority:not-granted"],
    };

    const projected = projectContextPacketRuntimeOutcome({ packet });

    expect(projected.codingResult.changedFiles).toEqual([]);
    expect(projected.codingResult.failedFiles[0]?.reason).toContain("needs more related reads");
    expect(projected.codingResult.continuation.evidence).toContain("context-plan:readiness:needs-more-context");
    expect(projected.userFacingOutput).toContain("Mutation authority: not-granted");
  });
});

