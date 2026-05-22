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
        "code-graph-trace code_graph_trace_abc; root=src/a.ts; contextGraph=ctx_graph_abc; facts=8; files=4; symbols=1; tests=1; docs=1; callSites=1; freshness=fresh; readiness=impact-ready; mutationAuthority=not-granted; raw-content-excluded",
        "code-graph-impact code_graph_impact_abc; trace=code_graph_trace_abc; target=src/a.ts; tests=1; callSites=1; docs=1; verification=1; stale=0; readiness=impact-ready; mutationAuthority=not-granted; raw-content-excluded",
        "task-lifecycle task_lifecycle_abc; task=task_abc; current=plan; next=proposal; status=ready; stages=read,analyze,plan; missingFacts=0; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
        "analysis-brief analysis_brief_abc; task=task_abc; readPlan=task_read_plan_abc; agentPlan=plan_abc; confidence=high; observations=2; missingFacts=0; verification=npm test -- --help; mutationAuthority=not-granted; hidden-cot-excluded",
        "task-execution-plan task_execution_plan_abc; task=task_abc; lifecycle=task_lifecycle_abc; brief=analysis_brief_abc; readPlan=task_read_plan_abc; agentPlan=plan_abc; quality=plan_quality_abc; proposal=ready; edit=review-only; verification=ready; repair=review-only; stops=0; mutationAuthority=not-granted",
        "task-lifecycle-trace task_lifecycle_trace_abc; task=task_abc; lifecycle=task_lifecycle_abc; stages=read,analyze,plan; planQuality=plan_quality_abc; codeGraphTrace=code_graph_trace_abc; failureClass=none; mutationAuthority=not-granted; raw-content-excluded",
        "test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
        "agent-plan plan_abc; owner=workspace-file-context; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
        "plan-quality plan_quality_abc; agentPlan=plan_abc; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; level=needs-more-context; score=62; mutationAuthority=not-granted; raw-content-excluded",
        "harness-trace harness_trace_abc; route=route188; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; agentPlan=plan_abc; planQuality=plan_quality_abc; stages=read,plan; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
        "harness-scorecard harness_scorecard_abc; trace=harness_trace_abc; planQuality=plan_quality_abc; context=warn; plan=warn; provider=fail; verification=skip; repair=skip; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
        "generated-edit proposal=generated-edit-abc; targets=src/a.ts; confirmation=review-required; mutationAuthority:not-granted; raw-content-excluded",
        "context-aware-provider proposal=provider-edit-abc; status=review-required-proposal; contextPacket=ctx_abc; agentPlan=plan_abc; mutationAuthority=not-granted; raw-content-excluded",
        "real-provider-proposal-dry-run id=real_provider_proposal_dry_run_abc; status=dry-run-exact-ready-no-write; provider=fake-real-provider; providerCalled=true; gate=allow-dry-run; promptAudit=pass; outputValidation=valid-exact-single-target; anchorQuality=exact-ready; proposal=provider-edit-abc; mutationAuthority=not-granted; raw-content-excluded",
        "anchored-proposal-scorecard anchored_proposal_scorecard_abc; proposal=provider-edit-abc; anchoredProposal=provider-anchored-proposal-abc; dryRun=real_provider_proposal_dry_run_abc; promptAudit=provider_prompt_audit_abc; outputValidation=provider_output_validation_abc; anchorQuality=provider_anchor_quality_abc; exact=1; partial=0; unsupported=0; failureClass=none; noWrite=pass; mutationAuthority=not-granted; raw-content-excluded",
        "provider-smoke-result:status:real-provider-smoke-skipped-no-opt-in",
        "live-provider-smoke-result:provider-called:true",
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
      "code-graph-trace=code-graph-trace code_graph_trace_abc; root=src/a.ts; contextGraph=ctx_graph_abc; facts=8; files=4; symbols=1; tests=1; docs=1; callSites=1; freshness=fresh; readiness=impact-ready; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "code-graph-impact=code-graph-impact code_graph_impact_abc; trace=code_graph_trace_abc; target=src/a.ts; tests=1; callSites=1; docs=1; verification=1; stale=0; readiness=impact-ready; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "task-lifecycle=task-lifecycle task_lifecycle_abc; task=task_abc; current=plan; next=proposal; status=ready; stages=read,analyze,plan; missingFacts=0; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
    );
    expect(details).toContain(
      "analysis-brief=analysis-brief analysis_brief_abc; task=task_abc; readPlan=task_read_plan_abc; agentPlan=plan_abc; confidence=high; observations=2; missingFacts=0; verification=npm test -- --help; mutationAuthority=not-granted; hidden-cot-excluded",
    );
    expect(details.some((detail) =>
      detail.startsWith(
        "task-execution-plan=task-execution-plan task_execution_plan_abc;",
      ) &&
      detail.includes("analysis_brief_abc") &&
      detail.includes("mutationAuthority"),
    )).toBe(true);
    expect(details).toContain(
      "test-impact=test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
    );
    expect(details).toContain(
      "agent-plan=agent-plan plan_abc; owner=workspace-file-context; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
    );
    expect(details).toContain(
      "plan-quality=plan-quality plan_quality_abc; agentPlan=plan_abc; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; level=needs-more-context; score=62; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "harness-trace=harness-trace harness_trace_abc; route=route188; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; agentPlan=plan_abc; planQuality=plan_quality_abc; stages=read,plan; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "harness-scorecard=harness-scorecard harness_scorecard_abc; trace=harness_trace_abc; planQuality=plan_quality_abc; context=warn; plan=warn; provider=fail; verification=skip; repair=skip; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "proposal-hunk-set=proposal-hunk-set proposal=provider-edit-abc; hunkSet=proposal-hunk-set-def; source=provider; targets=src/a.ts; mutationAuthority:not-granted; raw-content-excluded",
    );
    expect(details).toContain(
      "context-aware-provider=context-aware-provider proposal=provider-edit-abc; status=review-required-proposal; contextPacket=ctx_abc; agentPlan=plan_abc; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(details.some((detail) =>
      detail.startsWith(
        "real-provider-dry-run=real-provider-proposal-dry-run id=real_provider_proposal_dry_run_abc;",
      ) &&
      detail.includes("promptAudit=pass") &&
      detail.includes("anchorQuality=exact-ready"),
    )).toBe(true);
    expect(details.some((detail) =>
      detail.startsWith(
        "anchored-proposal-runtime=anchored-proposal-scorecard anchored_proposal_scorecard_abc;",
      ) &&
      detail.includes("anchoredProposal=provider-anchored-proposal-abc"),
    )).toBe(true);
    expect(details).toContain(
      "anchored-provider-smoke=provider-smoke-result:status:real-provider-smoke-skipped-no-opt-in",
    );
    expect(details).toContain(
      "live-provider-smoke=live-provider-smoke-result:provider-called:true",
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
