import { describe, expect, it } from "vitest";

import { projectContextPacketToAgentPlanContext } from "./agentPlanContext.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("projectContextPacketToAgentPlanContext", () => {
  it("projects context packet facts into replay-safe agent planning input", () => {
    const packet: TargetedContextPacket = {
      packetId: "ctx_test",
      rootTargetFile: "src/target.ts",
      targetSafeLabel: "src/target.ts",
      targetKind: "explicit-code-target",
      readBudget: {
        maxCandidateCount: 4,
        maxFilesRead: 4,
        maxBytesPerFile: 100,
        maxTotalBytes: 400,
        filesRead: 2,
        bytesUsed: 80,
      },
      contextSources: [],
      selectedCandidateSummaries: [
        {
          kind: "target-file-summary",
          pathLabel: "src/target.ts",
          relation: "explicit target",
          status: "included",
          summary: "lines=1",
          byteLength: 40,
          redactionApplied: false,
        },
      ],
      omittedCandidateSummaries: [
        {
          kind: "omitted-over-budget-candidate",
          pathLabel: "src/target.test.ts",
          relation: "nearby test",
          status: "omitted",
          reason: "file budget",
          byteLength: 500,
          redactionApplied: false,
        },
      ],
      confidence: "medium",
      completenessStatus: "partial",
      freshnessFacts: ["fresh"],
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-packet ctx_test; target=src/target.ts",
      mutationAuthority: "not-granted",
      evidence: ["context-packet:raw-full-content-excluded"],
    };

    const context = projectContextPacketToAgentPlanContext(packet);

    expect(context.contextPacketIds).toEqual(["ctx_test"]);
    expect(context.executionReadiness).toBe("needs-more-context");
    expect(context.suggestedReads).toEqual(["src/target.test.ts"]);
    expect(context.mutationAuthority).toBe("not-granted");
    expect(context.replaySafeEvidence).toContain(
      "context-packet:raw-full-content-excluded",
    );
  });
});
