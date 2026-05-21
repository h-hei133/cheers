import { describe, expect, it } from "vitest";

import { buildContextPlanningSummary } from "./contextPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("buildContextPlanningSummary", () => {
  it("surfaces missing context and suggested reads without write authority", () => {
    const packet: TargetedContextPacket = {
      packetId: "ctx_test",
      rootTargetFile: "src/target.ts",
      targetSafeLabel: "src/target.ts",
      targetKind: "explicit-code-target",
      readBudget: {
        maxCandidateCount: 2,
        maxFilesRead: 2,
        maxBytesPerFile: 10,
        maxTotalBytes: 20,
        filesRead: 2,
        bytesUsed: 10,
      },
      contextSources: [],
      selectedCandidateSummaries: [
        {
          kind: "target-file-summary",
          pathLabel: "src/target.ts",
          relation: "explicit target",
          status: "included",
          summary: "lines=1",
          byteLength: 10,
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
          byteLength: 100,
          redactionApplied: false,
        },
      ],
      confidence: "medium",
      completenessStatus: "partial",
      freshnessFacts: ["fresh"],
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "packet",
      mutationAuthority: "not-granted",
      evidence: [],
    };

    const plan = buildContextPlanningSummary(packet);

    expect(plan.executionReadiness).toBe("needs-more-context");
    expect(plan.suggestedNextReads).toEqual(["src/target.test.ts"]);
    expect(plan.mutationAuthority).toBe("not-granted");
  });
});

