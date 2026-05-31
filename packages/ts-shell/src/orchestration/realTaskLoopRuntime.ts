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
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";
import { activateTaskLifecycle } from "./taskLifecycleActivation.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { RealProviderProposalDryRunProvider } from "./realProviderProposalDryRun.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import {
  createRealTaskLoopFixture,
  readRealTaskLoopTarget,
  realTaskLoopExactNewText,
  realTaskLoopExactOldText,
  realTaskLoopRepairableFailedText,
  removeRealTaskLoopFixture,
  verifyRealTaskLoopReadback,
  type RealTaskLoopFixture,
} from "./realTaskLoopFixture.js";
import {
  runRealTaskLoopRepairChain,
  type RealTaskLoopRepairChainOutput,
} from "./realTaskLoopRepairChain.js";
import { buildRealTaskLoopPlan } from "./realTaskLoopPlan.js";
import { buildRealTaskLoopScorecard } from "./realTaskLoopScorecard.js";
import {
  buildRealTaskLoopResult,
  classifyRealTaskLoopApplyStatus,
  classifyRealTaskLoopMutationScope,
  classifyRealTaskLoopRecoveryStatus,
  classifyRealTaskLoopSnapshotStatus,
  classifyRealTaskLoopVerificationStatus,
  type RealTaskLoopResult,
} from "./realTaskLoopResult.js";
import type { ClaimLedgerEvidenceSource } from "./claimLedgerProjection.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

export type RealTaskLoopProviderMode = "default-skip" | "fake" | "real-opt-in";

export interface RealTaskLoopRuntimeOutput {
  readonly fixture: RealTaskLoopFixture;
  readonly runtime?: AnchoredProposalRuntimeResult;
  readonly applyResult?: EditProposalApplyResult;
  readonly repair?: RealTaskLoopRepairChainOutput;
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
  readonly runRepairAfterVerificationFailure?: boolean;
  readonly confirmRepairApply?: boolean;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
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
      input.provider ?? (
        input.runRepairAfterVerificationFailure
          ? buildRealTaskLoopRepairableFailureProvider()
          : buildRealTaskLoopFakeProvider()
      ),
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
    const exactReady = isExactReadyAnchoredProposal(runtime);
    const trustedConfirmation = Boolean(input.confirmApply && exactReady && rawOutput);
    const providerCallsBeforeApply = providerRecorder.getCallCount();
    const applyResult =
      trustedConfirmation
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
    const providerCallsAfterApply = providerRecorder.getCallCount();
    const providerCallDuringApply = Boolean(
      applyResult && providerCallsAfterApply > providerCallsBeforeApply,
    );
    const applyStatus = classifyRealTaskLoopApplyStatus(applyResult);
    const verificationStatus = classifyRealTaskLoopVerificationStatus(readback);
    const evidenceSource = resolveClaimLedgerEvidenceSource({
      ...input,
      syntheticProviderFallback: input.providerMode === "real-opt-in" && !input.provider,
    });
    const repair =
      input.runRepairAfterVerificationFailure &&
        verificationStatus === "failed" &&
        readback?.status === "failed" &&
        applyStatus === "succeeded"
        ? await runRealTaskLoopRepairChain({
            requestId,
            fixture,
            initialChangedFiles: applyResult?.changedFiles ?? [],
            originalReadback: readback,
            confirmRepairApply: input.confirmRepairApply ?? false,
          })
        : undefined;
    const snapshotStatus = classifyRealTaskLoopSnapshotStatus(applyResult);
    const recoveryStatus = classifyRealTaskLoopRecoveryStatus(applyResult);
    const mutationScope = classifyRealTaskLoopMutationScope(applyResult?.changedFiles ?? []);
    const plan = buildRealTaskLoopPlan({
      fixtureId: fixture.fixtureId,
      lifecycleId: activation.taskLifecycle.lifecycleId,
      analysisBriefId: activation.analysisBrief.briefId,
      planQualityId: activation.planQuality.qualityId,
      providerKind: input.providerMode === "fake" ? "fake-provider" : "openai-compatible",
      dryRunId: runtime.dryRun?.dryRunId,
      anchoredProposalId: runtime.anchoredProposal?.anchoredProposalId,
      confirmationState: input.confirmApply
        ? trustedConfirmation ? "trusted-confirmed" : "invalid"
        : exactReady ? "required" : "not-requested",
      ...(trustedConfirmation && runtime.anchoredProposal
        ? { applyPlanId: runtime.anchoredProposal.anchoredProposalId }
        : {}),
      repairEligibility: verificationStatus === "failed" ? "eligible" : "not-needed",
      state: verificationStatus === "succeeded"
        ? "verification-succeeded"
        : verificationStatus === "failed"
          ? "verification-failed"
        : applyResult
            ? applyStatus === "succeeded" ? "apply-succeeded" : "apply-stopped"
            : exactReady ? "confirmation-required" : "review-required",
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
      applyStatus,
      snapshotRecoveryReady: snapshotStatus === "created" || recoveryStatus === "available",
      verificationStatus,
      repairEligible: verificationStatus === "failed",
      defaultNoProviderNoApply: false,
      mutationScope,
      providerCallDuringApply,
      providerErrorClass: runtime.dryRun?.providerErrorClass,
      ...(repair
        ? {
            repairProposalStatus: repair.proof.proposalStatus,
            repairApplyStatus: repair.proof.applyStatus,
            repairVerificationStatus: repair.proof.verificationStatus,
          }
        : {}),
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
      evidenceSource,
      providerCallDuringApply,
      ...(repair ? { repairProof: repair.proof } : {}),
    });
    return { fixture, runtime, ...(applyResult ? { applyResult } : {}), ...(repair ? { repair } : {}), result, cleanup };
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
          summary: "rename startApp declaration and local call site to runApp",
          oldText: realTaskLoopExactOldText,
          newText: realTaskLoopExactNewText,
        },
      ],
      confidence: "high",
      riskSummary: "controlled fixture exact rename",
      verificationPlan: ["safe readback verifies runApp and absence of startApp"],
    }),
  };
}

function buildRealTaskLoopRepairableFailureProvider(): RealProviderProposalDryRunProvider {
  return {
    proposeEdit: (): ProviderEditRawProposal => ({
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: "src/smoke.ts",
          summary: "rename declaration while leaving a deterministic call-site verification failure for repair",
          oldText: realTaskLoopExactOldText,
          newText: realTaskLoopRepairableFailedText,
        },
      ],
      confidence: "high",
      riskSummary: "controlled fixture exact partial rename to exercise repair proof chain",
      verificationPlan: ["safe readback must fail before repair and pass after confirmed repair"],
    }),
  };
}

function recordProviderOutput(provider: RealProviderProposalDryRunProvider): {
  readonly provider: RealProviderProposalDryRunProvider;
  readonly getRawOutput: () => ProviderEditRawProposal | undefined;
  readonly getCallCount: () => number;
} {
  let rawOutput: ProviderEditRawProposal | undefined;
  let callCount = 0;
  return {
    provider: {
      proposeEdit: async (context) => {
        callCount += 1;
        rawOutput = await provider.proposeEdit(context);
        return rawOutput;
      },
    },
    getRawOutput: () => rawOutput,
    getCallCount: () => callCount,
  };
}

function isExactReadyAnchoredProposal(runtime: AnchoredProposalRuntimeResult): boolean {
  return runtime.anchoredProposal?.handoffReadiness === "exact-single-target" ||
    runtime.anchoredProposal?.handoffReadiness === "exact-hunk-set";
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
    evidenceSource: "default-safe",
  });
  return {
    fixture: input.fixture,
    result,
    cleanup: input.cleanup,
  };
}

function evidenceSourceForProviderMode(
  providerMode: RealTaskLoopProviderMode,
): ClaimLedgerEvidenceSource {
  if (providerMode === "default-skip") return "default-safe";
  if (providerMode === "fake") return "fake-provider";
  return "focused-tests";
}

function resolveClaimLedgerEvidenceSource(input: {
  readonly providerMode: RealTaskLoopProviderMode;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
  readonly syntheticProviderFallback?: boolean;
}): ClaimLedgerEvidenceSource {
  if (input.evidenceSource === "live-provider" && input.syntheticProviderFallback) {
    return "focused-tests";
  }
  return input.evidenceSource ?? evidenceSourceForProviderMode(input.providerMode);
}
