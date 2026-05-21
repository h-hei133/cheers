import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../orchestration/types.js";
import { formatContinuationEvidenceParityDetails } from "./continuationEvidenceParity.js";

describe("continuation evidence parity", () => {
  it("normalizes context agent-plan and edit stopped evidence without raw content", () => {
    const details = formatContinuationEvidenceParityDetails(
      makeCodingResult([
        "context-packet ctx_abc; target=src/a.ts; included=2; omitted=1; mutationAuthority=not-granted; raw-full-content-excluded",
        "context-plan ctx_abc; readiness=needs-more-context; suggestedReads=1; tests=0; mutationAuthority=not-granted",
        "context-graph ctx_graph_abc; root=src/a.ts; nodes=5; included=4; omitted=1; mutationAuthority=not-granted; raw-content-excluded",
        "test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
        "agent-plan plan_abc; owner=workspace-file-context; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
        "generated-edit proposal=generated-edit-abc; targets=src/a.ts; confirmation=review-required; mutationAuthority:not-granted; raw-content-excluded",
        "context-aware-provider proposal=provider-edit-abc; status=review-required-proposal; contextPacket=ctx_abc; agentPlan=plan_abc; mutationAuthority=not-granted; raw-content-excluded",
        "edit-repair-proposal id=edit-repair-proposal-def; targets=src/a.ts; confirmation=review-required; mutationAuthority:not-granted; raw-content-excluded",
        "verification-command id=verification-command-plan-abc:result:failed; plan=verification-command-plan-abc; command=npm test -- --help; outcome=failed; failureClass=test-failed; runtimeReceipts=1; repairEligible=yes; mutation:not-run; raw-content-excluded",
        "verification-repair-loop id=verification-repair-loop-abc; state=repair-review-required; repairContext=edit-repair-context-def; repairProposal=edit-repair-proposal-def; contextPacket=ctx_abc; agentPlan=plan_abc; verification=failed; runtimeReceipts=1; provider=proposal-only; next=review; raw-content-excluded",
        "verification-repair-prompt loop=verification-repair-loop-abc; context=edit-repair-context-def; contextPacket=ctx_abc; agentPlan=plan_abc; runtimeReceipts=1; mutationAuthority:not-granted; raw-content-excluded",
        "proposal-hunk-set proposal=provider-edit-abc; hunkSet=proposal-hunk-set-def; source=provider; targets=src/a.ts; mutationAuthority:not-granted; raw-content-excluded",
      ]),
    );

    expect(details).toContain(
      "context-packet=context-packet ctx_abc; target=src/a.ts; included=2; omitted=1; mutationAuthority=not-granted; raw-full-content-excluded",
    );
    expect(details).toContain(
      "context-graph=context-graph ctx_graph_abc; root=src/a.ts; nodes=5; included=4; omitted=1; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "test-impact=test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
    );
    expect(details).toContain(
      "agent-plan=agent-plan plan_abc; owner=workspace-file-context; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
    );
    expect(details).toContain(
      "proposal-hunk-set=proposal-hunk-set proposal=provider-edit-abc; hunkSet=proposal-hunk-set-def; source=provider; targets=src/a.ts; mutationAuthority:not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "context-aware-provider=context-aware-provider proposal=provider-edit-abc; status=review-required-proposal; contextPacket=ctx_abc; agentPlan=plan_abc; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details.some((detail) =>
      detail.startsWith(
        "verification-repair-loop=verification-repair-loop id=verification-repair-loop-abc;",
      ) && detail.includes("contextPacket=ctx_abc"),
    )).toBe(true);
    expect(details.some((detail) =>
      detail.startsWith(
        "verification-command=verification-command id=verification-command-plan-abc:result:failed;",
      ) && detail.includes("failureClass=test-failed"),
    )).toBe(true);
    expect(JSON.stringify(details)).not.toContain("RAW_SECRET");
  });
});

function makeCodingResult(
  continuationEvidence: readonly string[],
): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "failed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [...continuationEvidence],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [],
      requiredEvidence: [],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
      reason: "review required",
      blockerKind: "unknown",
    },
    evidence: [],
  };
}
