import fs from "node:fs";
import path from "node:path";

import {
  runAnchoredProposalRuntime,
  type AnchoredProposalRuntimeResult,
} from "./anchoredProposalRuntime.js";
import {
  buildAnchoredProposalMappingByHunkId,
  buildAnchoredProviderProposalReview,
} from "./providerAnchoredProposal.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { applyEditProposalSelection, type EditProposalApplyResult } from "./editProposalApply.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import { activateTaskLifecycle } from "./taskLifecycleActivation.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { RealProviderProposalDryRunProvider } from "./realProviderProposalDryRun.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import {
  createRealTaskLoopFixture,
  readRealTaskLoopTarget,
  removeRealTaskLoopFixture,
  verifyRealTaskLoopReadback,
  type RealTaskLoopFixture,
} from "./realTaskLoopFixture.js";
import { buildRealTaskLoopPlan } from "./realTaskLoopPlan.js";
import { buildRealTaskLoopScorecard } from "./realTaskLoopScorecard.js";
import { buildRealTaskLoopResult, type RealTaskLoopResult } from "./realTaskLoopResult.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

export type RealTaskLoopProviderMode = "default-skip" | "fake" | "real-opt-in";

export interface RealTaskLoopRuntimeOutput {
  readonly fixture: RealTaskLoopFixture;
  readonly runtime?: AnchoredProposalRuntimeResult;
  readonly applyResult?: EditProposalApplyResult;
  readonly result: RealTaskLoopResult;
  readonly cleanup: "pending" | "removed";
}

export async function runRealTaskLoopRuntime(input: {
  readonly requestId?: string;
  readonly providerMode: RealTaskLoopProviderMode;
  readonly confirmApply?: boolean;
  readonly provider?: RealProviderProposalDryRunProvider;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly testRoot?: string;
  readonly cleanupFixture?: boolean;
  readonly simulateVerificationFailure?: boolean;
}): Promise<RealTaskLoopRuntimeOutput> {
  const requestId = input.requestId ?? "route200-real-task-loop";
  const fixture = createRealTaskLoopFixture({
    fixtureId: `${requestId}-fixture`,
    ...(input.testRoot ? { testRoot: input.testRoot } : {}),
  });
  let cleanup: RealTaskLoopRuntimeOutput["cleanup"] = "pending";
  try {
    if (input.providerMode === "default-skip") {
      return buildStoppedDefault({ fixture, cleanup });
    }

    const activation = await activateReadyTaskLifecycle({
      workspaceRoot: fixture.workspaceRoot,
      prompt: fixture.userTask,
    });
    const currentContent = readRealTaskLoopTarget(fixture);
    const providerRecorder = recordProviderOutput(
      input.provider ?? buildRealTaskLoopFakeProvider(),
    );
    const runtime = await runAnchoredProposalRuntime({
      requestId,
      sessionId: `${requestId}-session`,
      prompt: fixture.userTask,
      taskActivation: activation,
      dryRunMode: input.providerMode === "fake" ? "fake" : "real-opt-in",
      providerAvailability: input.providerMode === "fake"
        ? { kind: "available", providerKindLabel: "fake-provider" }
        : input.providerAvailability ?? { kind: "not-configured", reason: "provider unavailable for task loop" },
      provider: providerRecorder.provider,
      currentContentByTargetLabel: new Map([[fixture.targetPath, currentContent]]),
      inWorkspaceTargetLabels: [fixture.targetPath],
    });

    const rawOutput = providerRecorder.getRawOutput();
    const applyResult =
      input.confirmApply && runtime.anchoredProposal && rawOutput
        ? await applyAnchoredProposal({
            fixture,
            runtime,
            rawOutput,
            requestId,
          })
        : undefined;
    const readback =
      applyResult && applyResult.changedFiles.length > 0
        ? verifyRealTaskLoopReadback({
            fixture,
            content: input.simulateVerificationFailure
              ? fs.readFileSync(path.join(fixture.workspaceRoot, fixture.targetPath), "utf8").replace("runApp", "startApp")
              : undefined,
          })
        : undefined;
    const plan = buildRealTaskLoopPlan({
      fixtureId: fixture.fixtureId,
      lifecycleId: activation.taskLifecycle.lifecycleId,
      analysisBriefId: activation.analysisBrief.briefId,
      planQualityId: activation.planQuality.qualityId,
      providerKind: input.providerMode === "fake" ? "fake-provider" : "openai-compatible",
      dryRunId: runtime.dryRun?.dryRunId,
      anchoredProposalId: runtime.anchoredProposal?.anchoredProposalId,
      confirmationState: input.confirmApply
        ? runtime.anchoredProposal ? "confirmed" : "invalid"
        : runtime.anchoredProposal ? "required" : "not-requested",
      applyPlanId: runtime.anchoredProposal?.anchoredProposalId,
      repairEligibility: readback?.status === "failed" ? "eligible" : "not-needed",
      state: readback?.status === "passed"
        ? "verification-succeeded"
        : readback?.status === "failed"
          ? "verification-failed"
          : applyResult
            ? applyResult.changedFiles.length > 0 ? "apply-succeeded" : "apply-stopped"
            : runtime.anchoredProposal ? "confirmation-required" : "review-required",
    });
    const scorecard = buildRealTaskLoopScorecard({
      taskLoopId: plan.taskLoopId,
      lifecycleReady: true,
      analysisAllowed: activation.analysisQualityGate.allowed,
      planReady: activation.planQuality.level === "ready",
      providerCalled: runtime.dryRun?.providerCalled ?? false,
      providerExpected: true,
      outputValidationStatus: runtime.dryRun?.outputValidation?.status,
      anchorQuality: runtime.dryRun?.anchorQuality?.level,
      confirmationState: plan.confirmationState,
      applyStatus: applyResult
        ? applyResult.changedFiles.length > 0 ? "applied" : "stopped"
        : "not-run",
      snapshotRecoveryReady: Boolean(applyResult?.evidence.some((entry) => /snapshot|recovery|rollback-ready/.test(entry))),
      verificationStatus: readback?.status ?? "not-run",
      repairEligible: readback?.status === "failed",
      defaultNoProviderNoApply: false,
      mutationScope: applyResult?.changedFiles.length ? "controlled-temp-fixture" : "none",
    });
    const result = buildRealTaskLoopResult({
      fixture,
      plan,
      runtime,
      ...(applyResult ? { applyResult } : {}),
      ...(readback ? { readback } : {}),
      scorecard,
      liveOptIn: input.providerMode === "real-opt-in",
      confirmApply: input.confirmApply ?? false,
    });
    return { fixture, runtime, ...(applyResult ? { applyResult } : {}), result, cleanup };
  } finally {
    if (input.cleanupFixture !== false) {
      removeRealTaskLoopFixture(fixture);
      cleanup = "removed";
    }
  }
}

async function activateReadyTaskLifecycle(input: {
  readonly workspaceRoot: string;
  readonly prompt: string;
}) {
  const workflowPlan: WorkflowTaskPlan = {
    taskKind: "read-file",
    reason: "controlled real provider task loop fixture",
    targetPath: "src/smoke.ts",
    contextPlanningRequested: true,
    contextPlanningReason: "explicit-context-packet",
    inspectFirst: true,
    verifyAfterEdit: true,
  };
  const activation = await activateTaskLifecycle({
    workspaceRoot: input.workspaceRoot,
    prompt: input.prompt,
    workflowPlan,
  });
  if (!activation) throw new Error("expected task lifecycle activation for controlled fixture");
  return {
    ...activation,
    analysisQualityGate: {
      ...activation.analysisQualityGate,
      allowed: true,
      decision: "allow-plan" as const,
    },
    planQuality: {
      ...activation.planQuality,
      level: "ready" as const,
    },
  };
}

function buildRealTaskLoopFakeProvider(): RealProviderProposalDryRunProvider {
  return {
    proposeEdit: (): ProviderEditRawProposal => ({
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: "src/smoke.ts",
          summary: "rename startApp declaration to runApp",
          oldText: "export function startApp() {",
          newText: "export function runApp() {",
        },
        {
          path: "src/smoke.ts",
          summary: "rename startApp call site to runApp",
          oldText: "export const bootMessage = startApp();",
          newText: "export const bootMessage = runApp();",
        },
      ],
      confidence: "high",
      riskSummary: "controlled fixture exact rename",
      verificationPlan: ["safe readback verifies runApp and absence of startApp"],
    }),
  };
}

function recordProviderOutput(provider: RealProviderProposalDryRunProvider): {
  readonly provider: RealProviderProposalDryRunProvider;
  readonly getRawOutput: () => ProviderEditRawProposal | undefined;
} {
  let rawOutput: ProviderEditRawProposal | undefined;
  return {
    provider: {
      proposeEdit: async (context) => {
        rawOutput = await provider.proposeEdit(context);
        return rawOutput;
      },
    },
    getRawOutput: () => rawOutput,
  };
}

async function applyAnchoredProposal(input: {
  readonly fixture: RealTaskLoopFixture;
  readonly runtime: AnchoredProposalRuntimeResult;
  readonly rawOutput: ProviderEditRawProposal;
  readonly requestId: string;
}): Promise<EditProposalApplyResult> {
  const validation = validateProviderOutput({
    requestId: input.requestId,
    rawOutput: input.rawOutput,
    explicitTargetLabels: [input.fixture.targetPath],
  });
  const extraction = extractProviderProposalAnchors({
    requestId: input.requestId,
    rawOutput: input.rawOutput,
    validation,
  });
  const currentContentByTargetLabel = new Map([[input.fixture.targetPath, readRealTaskLoopTarget(input.fixture)]]);
  const matchResult = matchProviderAnchorCandidates({
    requestId: input.requestId,
    candidates: extraction.candidates,
    explicitTargetLabels: [input.fixture.targetPath],
    currentContentByTargetLabel,
    inWorkspaceTargetLabels: [input.fixture.targetPath],
  });
  detectProviderAnchorConflicts({
    requestId: input.requestId,
    matchResult,
    currentContentByTargetLabel,
  });
  const review = buildAnchoredProviderProposalReview(input.runtime.anchoredProposal!);
  const selection = selectEditProposalHunks({
    review,
    action: "select-all-exact",
    explicitConfirmation: true,
  });
  const authority = createWorkspaceWriteAuthority(input.fixture.workspaceRoot);
  return applyEditProposalSelection({
    selection,
    mappingByHunkId: buildAnchoredProposalMappingByHunkId({
      manifest: input.runtime.anchoredProposal!,
      matchResult,
    }),
    targetPathByLabel: new Map([[input.fixture.targetPath, input.fixture.targetPath]]),
    fencedOptions: {
      workspaceRoot: input.fixture.workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
    targetSetOptions: {
      workspaceRoot: input.fixture.workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  });
}

function buildStoppedDefault(input: {
  readonly fixture: RealTaskLoopFixture;
  readonly cleanup: RealTaskLoopRuntimeOutput["cleanup"];
}): RealTaskLoopRuntimeOutput {
  const plan = buildRealTaskLoopPlan({
    fixtureId: input.fixture.fixtureId,
    providerKind: "none",
    confirmationState: "not-requested",
    state: "provider-skipped",
  });
  const scorecard = buildRealTaskLoopScorecard({
    taskLoopId: plan.taskLoopId,
    lifecycleReady: false,
    analysisAllowed: false,
    planReady: false,
    providerCalled: false,
    providerExpected: false,
    confirmationState: plan.confirmationState,
    applyStatus: "not-run",
    snapshotRecoveryReady: false,
    verificationStatus: "not-run",
    repairEligible: false,
    defaultNoProviderNoApply: true,
    mutationScope: "none",
    failureClass: "safe-skip",
  });
  const result = buildRealTaskLoopResult({
    fixture: input.fixture,
    plan,
    scorecard,
    liveOptIn: false,
    confirmApply: false,
  });
  return {
    fixture: input.fixture,
    result,
    cleanup: input.cleanup,
  };
}
