import { describe, expect, it } from "vitest";

import { projectPlanningRuntimeSurface } from "./planningRuntimeSurface.js";
import type { PlanningRuntimeResult } from "../planning/runtime/engine.js";

describe("projectPlanningRuntimeSurface", () => {
  it("projects planning runtime output without granting mutation or execution authority", () => {
    const result: PlanningRuntimeResult = {
      runtimeId: "planning_runtime_test",
      status: "needs-more-context",
      context: {
        engineId: "context_engine_test",
        status: "reused-memory",
        userTask: "fix target ranking",
        repo: {
          snapshot: {
            snapshotId: "repo_intel_test",
            workspaceRootLabel: "fixture",
            packageMap: [],
            moduleMap: [],
            entrypointMap: [],
            testMap: [],
            configMap: [],
            boundaryHints: [],
            files: [],
            cacheStatus: "disabled",
            staleIndexWarnings: [],
            evidence: [],
          },
          candidates: [
            {
              path: "src/app.ts",
              safeLabel: "src/app.ts",
              role: "source",
              score: 99,
              reasons: ["path-name-match"],
              symbolHints: ["app"],
              freshness: "fresh-stat",
            },
          ],
          recentRelevantFiles: ["src/app.ts"],
          missingFacts: [],
          nextReadSuggestions: [],
          evidence: [],
        },
        workflowPlan: {
          taskKind: "edit-file",
          reason: "fix target ranking",
          targetPath: "src/app.ts",
          inspectFirst: true,
          verifyAfterEdit: true,
        },
        memory: {
          memoryId: "ctx_mem_test",
          taskFingerprint: "task_fp_test",
          repoSnapshotId: "repo_intel_test",
          selectedTargetPath: "src/app.ts",
          candidateFiles: ["src/app.ts"],
          fileReceipts: [],
          compactSummary: "target=src/app.ts",
          missingFacts: ["call-site context missing"],
          planningWarnings: ["adjacent verification is inferred"],
          planQualityLevel: "needs-more-context",
          contextSufficiencyState: "needs-optional-context",
          editTargetRationale: ["src/app.ts: selected"],
          verificationIntent: ["npm test -- --help"],
          handoffSummary: "handoff=blocked",
          invalidation: {
            policy: "stat-size-mtime",
            staleFiles: [],
          },
          redactionStatus: "redacted-and-budgeted",
          mutationAuthority: "not-granted",
          evidence: [],
        },
        filesRead: [],
        contextBudget: {
          candidateFiles: 1,
          filesRead: 0,
          bytesUsed: 0,
          cacheStatus: "disabled",
        },
        missingFacts: ["call-site context missing"],
        nextReadSuggestions: [],
        evidence: [],
      },
      groundedAnalysis: {
        summary: "target=src/app.ts",
        confidence: "medium",
        missingFacts: ["call-site context missing"],
        planningWarnings: ["adjacent verification is inferred"],
        evidenceIds: ["ctx_mem_test"],
      },
      executablePlan: {
        summary: "review selected target",
        steps: ["Review selected edit targets."],
      },
      editTargets: [
        {
          path: "src/app.ts",
          rationale: "selected",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "needs-more-context",
        },
      ],
      verificationIntent: {
        state: "context-not-ready",
        commands: ["npm test -- --help"],
        evidence: ["verification:not-executed"],
      },
      mutationHandoff: {
        handoffId: "planning-mutation-handoff-test",
        handoffState: "missing-context",
        readiness: "blocked",
        targetPaths: ["src/app.ts"],
        targets: [
          {
            path: "src/app.ts",
            rationale: "selected",
            readiness: "needs-more-context",
            handoffRoute: "existing-proof-carrying-mutation-runtime",
            relevantContextReceiptIds: ["context-receipt:ctx_mem_test:1"],
            readEvidenceIds: ["read-evidence:context_engine_test:1"],
            expectedChangeSummary: "Resolve context before mutation.",
            verificationIntentSummary: "state=context-not-ready; commands=1; command-dispatch=not-run",
            unsupportedReasons: ["call-site context missing"],
          },
        ],
        contextReceiptIds: ["context-receipt:ctx_mem_test:1"],
        readEvidenceIds: ["read-evidence:context_engine_test:1"],
        expectedChangeSummary: "Resolve context before mutation.",
        verificationIntent: {
          available: true,
          summary: "state=context-not-ready; commands=1; command-dispatch=not-run",
          evidenceIds: ["verification:not-executed"],
        },
        unsupportedReasons: ["call-site context missing"],
        route: "Route203-206-proof-carrying-backend-target",
        backendLane: "none",
        backendConsumption: "not-run",
        executionLane: "none",
        reviewState: "blocked",
        permissionState: "not-requested",
        requirements: [
          {
            id: "selected-target",
            status: "available-for-review",
            owner: "planning-runtime",
            detail: "selected src/app.ts",
          },
          {
            id: "exact-old-new-mapping",
            status: "not-applicable",
            owner: "reviewer",
            detail: "blocked until context is ready",
          },
        ],
        blockedReasons: ["call-site context missing"],
        reason: "needs context",
        nextAction: "Resolve missing facts before requesting mutation.",
        mutationAuthority: "not-granted",
        evidence: ["planning-mutation-handoff:readiness:blocked"],
      },
      continuationMemory: {
        memoryId: "ctx_mem_test",
        taskFingerprint: "task_fp_test",
        repoSnapshotId: "repo_intel_test",
        selectedTargetPath: "src/app.ts",
        candidateFiles: ["src/app.ts"],
        fileReceipts: [],
        compactSummary: "target=src/app.ts",
        missingFacts: ["call-site context missing"],
        planningWarnings: ["adjacent verification is inferred"],
        planQualityLevel: "needs-more-context",
        contextSufficiencyState: "needs-optional-context",
        editTargetRationale: ["src/app.ts: selected"],
        verificationIntent: ["npm test -- --help"],
        handoffSummary: "handoff=blocked",
        invalidation: {
          policy: "stat-size-mtime",
          staleFiles: [],
        },
        redactionStatus: "redacted-and-budgeted",
        mutationAuthority: "not-granted",
        evidence: [],
      },
      evidence: [],
    };

    const surface = projectPlanningRuntimeSurface(result);

    expect(surface.candidates[0]?.path).toBe("src/app.ts");
    expect(surface.enoughContext).toBe("missing-facts");
    expect(surface.planningWarnings).toEqual(["adjacent verification is inferred"]);
    expect(surface.groundedAnalysis.planningWarnings).toEqual(["adjacent verification is inferred"]);
    expect(surface.memory.planningWarnings).toBe(1);
    expect(surface.contextAcquisition.mode).toBe("memory-reuse");
    expect(surface.contextAcquisition.stages.map((stage) => stage.name)).toContain("memory-reuse");
    expect(surface.contextAcquisition.budget.filesRead).toBe(0);
    expect(surface.planningEvidence).toMatchObject({
      candidateFiles: ["src/app.ts"],
      filesRead: [],
      readReasons: [],
      missingFacts: ["call-site context missing"],
      editTargets: ["src/app.ts"],
      verificationIntent: "state=context-not-ready; command=npm test -- --help; readiness=not-ready",
      contextBudget: {
        candidateFiles: 1,
        filesRead: 0,
        bytesUsed: 0,
        cacheStatus: "disabled",
      },
      memoryReuseStatus: "reused-memory",
    });
    expect(surface.contextAcquisition.safety).toEqual({
      mutationAuthority: "not-granted",
      providerCall: "not-run",
      commandDispatch: "not-run",
    });
    expect(surface.verificationIntent).toMatchObject({
      state: "context-not-ready",
      command: "npm test -- --help",
      readiness: "not-ready",
    });
    expect(surface.mutationHandoff.readiness).toBe("blocked");
    expect(surface.mutationHandoff.backendLane).toBe("none");
    expect(surface.mutationHandoff.permissionState).toBe("not-requested");
    expect(surface.mutationHandoff.requirements).toContainEqual(
      expect.objectContaining({
        id: "selected-target",
        status: "available-for-review",
      }),
    );
    expect(surface.safety).toEqual({
      mutationAuthority: "not-granted",
      providerCall: "not-run",
      commandDispatch: "not-run",
    });
    expect(surface.evidence).toContain("planning-runtime-surface:raw-content-excluded");
    expect(surface.evidence).toContain("planning-runtime-surface:warnings:1");
    expect(surface.evidence).toContain("planning-runtime-surface:candidate-files:1");
    expect(surface.evidence).toContain("planning-runtime-surface:files-read:0");
    expect(surface.evidence).toContain("planning-runtime-surface:memory-reuse:reused-memory");
    expect(surface.evidence).toContain("context-acquisition:mode:memory-reuse");
    expect(surface.evidence).toContain("context-acquisition:stage:memory-reuse");
  });
});
