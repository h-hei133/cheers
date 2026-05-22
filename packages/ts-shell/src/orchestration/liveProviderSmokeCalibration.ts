import { evaluateAnchoredProviderSmokeGate, type AnchoredProviderSmokeGate } from "./anchoredProviderSmokeGate.js";
import { buildHarnessScorecard, type HarnessScorecard } from "./harnessScorecard.js";
import { buildHarnessTrace, type HarnessTrace } from "./harnessTrace.js";
import type { LiveProviderSmokeFixture } from "./liveProviderSmokeFixture.js";
import {
  normalizeLiveProviderSmokeEvidence,
  type LiveProviderSmokeEvidence,
} from "./liveProviderSmokeEvidence.js";
import { buildLiveProviderSmokeResult, type LiveProviderSmokeResult } from "./liveProviderSmokeResult.js";
import type { LiveProviderAdapterApproval } from "./liveProviderAdapterApproval.js";
import { buildProposalQualityReport, type ProposalQualityReport } from "./proposalQualityReport.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import { auditProviderPrompt, type ProviderPromptAudit } from "./providerPromptAudit.js";
import {
  runRealProviderProposalDryRun,
  type RealProviderProposalDryRunProvider,
  type RealProviderProposalDryRunResult,
} from "./realProviderProposalDryRun.js";

export type LiveSmokeCalibrationMode = "live-provider-smoke" | "fake-corpus";

export interface LiveProviderSmokeCalibration {
  readonly runId: string;
  readonly mode: LiveSmokeCalibrationMode;
  readonly gate: AnchoredProviderSmokeGate;
  readonly promptAudit: ProviderPromptAudit | null;
  readonly dryRun: RealProviderProposalDryRunResult | null;
  readonly qualityReport: ProposalQualityReport;
  readonly harnessTrace: HarnessTrace;
  readonly harnessScorecard: HarnessScorecard;
  readonly result: LiveProviderSmokeResult;
  readonly normalizedEvidence: LiveProviderSmokeEvidence;
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export async function runLiveProviderSmokeCalibration(input: {
  readonly requestId: string;
  readonly mode: LiveSmokeCalibrationMode;
  readonly explicitSmokeOptIn: boolean;
  readonly providerAvailability: ProviderEditAvailability;
  readonly fixture: LiveProviderSmokeFixture;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly taskExecutionPlanId?: string;
  readonly redactionStatus?: string;
  readonly provider?: RealProviderProposalDryRunProvider;
  readonly adapterApproval?: LiveProviderAdapterApproval;
}): Promise<LiveProviderSmokeCalibration> {
  const runId = `live_smoke_calibration_${input.requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const normalizedEvidence = normalizeLiveProviderSmokeEvidence(input);

  const gate = evaluateAnchoredProviderSmokeGate({
    requestId: input.requestId,
    mode: input.mode === "fake-corpus" ? "fake-corpus" : "real-provider",
    explicitSmokeOptIn: input.explicitSmokeOptIn,
    providerAvailability: input.providerAvailability,
    lifecycleId: normalizedEvidence.lifecycleId,
    analysisBriefId: normalizedEvidence.analysisBriefId,
    analysisQualityId: normalizedEvidence.analysisQualityId,
    analysisQualityDecision: normalizedEvidence.analysisQualityDecision,
    planQualityId: normalizedEvidence.planQualityId,
    planQualityLevel: normalizedEvidence.planQualityLevel,
    dryRunMode: "no-write",
    redactionStatus: normalizedEvidence.redactionStatus,
  });

  if (!gate.allowed) {
    const report = buildProposalQualityReport({
      runId,
      mode: input.mode,
      providerSafeLabel: gate.providerSafeLabel,
      gate,
    });
    return finishCalibration({ runId, mode: input.mode, gate, normalizedEvidence, qualityReport: report, adapterApproval: input.adapterApproval });
  }

  const promptAudit = auditProviderPrompt({
    requestId: input.requestId,
    promptContext: input.fixture.promptContext,
  });

  if (promptAudit.status !== "pass") {
    const report = buildProposalQualityReport({
      runId,
      mode: input.mode,
      providerSafeLabel: gate.providerSafeLabel,
      gate: { ...gate, decision: "stop-prompt-audit-failed" },
    });
    return finishCalibration({
      runId,
      mode: input.mode,
      gate,
      normalizedEvidence,
      promptAudit,
      qualityReport: report,
      adapterApproval: input.adapterApproval,
    });
  }

  if (input.mode === "live-provider-smoke" && !input.provider) {
    const report = buildProposalQualityReport({
      runId,
      mode: input.mode,
      providerSafeLabel: gate.providerSafeLabel,
      gate: { ...gate, decision: "skip-provider-not-ready" },
    });
    return finishCalibration({
      runId,
      mode: input.mode,
      gate: { ...gate, decision: "skip-provider-not-ready", allowed: false, skipReason: "provider-not-ready", reason: "No provider adapter supplied", nextAction: "Supply a provider adapter or use fake corpus", providerCall: "not-run", evidence: [...gate.evidence, "live-smoke-calibration:provider-adapter:missing"] } as AnchoredProviderSmokeGate,
      normalizedEvidence,
      promptAudit,
      qualityReport: report,
      adapterApproval: input.adapterApproval,
    });
  }

  if (input.mode === "fake-corpus") {
    const report = buildProposalQualityReport({
      runId,
      mode: input.mode,
      providerSafeLabel: gate.providerSafeLabel,
      gate,
    });
    return finishCalibration({
      runId,
      mode: input.mode,
      gate,
      normalizedEvidence,
      promptAudit,
      qualityReport: report,
      adapterApproval: input.adapterApproval,
    });
  }

  const dryRun = await runRealProviderProposalDryRun({
    requestId: input.requestId,
    dryRunOptIn: true,
    promptContext: input.fixture.promptContext,
    explicitTargetLabels: [input.fixture.targetLabel],
    lifecycleId: normalizedEvidence.lifecycleId,
    analysisBriefId: normalizedEvidence.analysisBriefId,
    analysisQualityId: normalizedEvidence.analysisQualityId,
    analysisQualityDecision: normalizedEvidence.analysisQualityDecision,
    planQualityId: normalizedEvidence.planQualityId,
    planQualityLevel: normalizedEvidence.planQualityLevel,
    contextPacketId: normalizedEvidence.contextPacketId,
    contextGraphId: normalizedEvidence.contextGraphId,
    codeGraphTraceId: normalizedEvidence.codeGraphTraceId,
    taskExecutionPlanId: normalizedEvidence.taskExecutionPlanId,
    providerAvailability: input.providerAvailability,
    redactionStatus: normalizedEvidence.redactionStatus,
    provider: input.provider,
    currentContentByTargetLabel: new Map([[input.fixture.targetLabel, input.fixture.currentContent]]),
    inWorkspaceTargetLabels: [input.fixture.targetLabel],
  });

  const report = buildProposalQualityReport({
    runId,
    mode: input.mode,
    providerSafeLabel: dryRun.providerSafeLabel ?? gate.providerSafeLabel,
    gate,
    dryRun,
  });

  return finishCalibration({
    runId,
    mode: input.mode,
    gate,
    normalizedEvidence,
    promptAudit,
    dryRun,
    qualityReport: report,
    adapterApproval: input.adapterApproval,
  });
}

function finishCalibration(input: {
  readonly runId: string;
  readonly mode: LiveSmokeCalibrationMode;
  readonly gate: AnchoredProviderSmokeGate;
  readonly normalizedEvidence: LiveProviderSmokeEvidence;
  readonly promptAudit?: ProviderPromptAudit | null;
  readonly dryRun?: RealProviderProposalDryRunResult | null;
  readonly qualityReport: ProposalQualityReport;
  readonly adapterApproval?: LiveProviderAdapterApproval;
}): LiveProviderSmokeCalibration {
  const harnessTrace = buildHarnessTrace({
    routeId: "route197-live-provider-smoke-calibration",
    taskLifecycleId: input.normalizedEvidence.lifecycleId,
    analysisBriefId: input.normalizedEvidence.analysisBriefId,
    planQualityId: input.normalizedEvidence.planQualityId,
    providerDryRunId: input.dryRun?.dryRunId,
    providerDryRunGateDecision: input.dryRun?.gate.decision ?? input.gate.decision,
    providerPromptAuditStatus: input.dryRun?.promptAudit?.status ?? input.promptAudit?.status,
    providerOutputValidationStatus: input.dryRun?.outputValidation?.status,
    providerAnchorQualityLevel: input.dryRun?.anchorQuality?.level,
    providerAnchoringAttempted: Boolean(input.dryRun?.anchoringResult),
    providerAnchoringOutcome: input.dryRun?.anchoringResult?.status,
    providerAnchoredProposalId: input.dryRun?.anchoredProposal?.anchoredProposalId,
    providerAnchoringExactness: input.dryRun?.anchoredProposal?.handoffReadiness,
    providerAnchoringReviewReadiness: input.dryRun?.anchoredProposal?.reviewRequirement,
    providerAnchoringNoWrite: input.dryRun?.anchoringResult?.noWrite,
    providerDryRunCalled: input.qualityReport.providerCalled,
    providerSmokeMode: input.qualityReport.mode,
    providerSmokeProviderKind: input.adapterApproval?.providerKind ?? input.qualityReport.providerSafeLabel,
    providerSmokeAdapterApproved: input.adapterApproval?.adapterApproved ?? false,
    providerSmokeProviderErrorClass: input.qualityReport.providerErrorClass,
    providerSmokeCaseId: input.qualityReport.caseId,
    providerSmokeSkipReason: input.qualityReport.skipReason,
    providerSmokeReportId: input.qualityReport.reportId,
    status: input.qualityReport.failureClass,
    reason: input.dryRun?.reason ?? input.gate.reason,
    evidence: [...input.normalizedEvidence.evidence, ...input.gate.evidence, ...input.qualityReport.evidence],
  });

  const harnessScorecard = buildHarnessScorecard({
    trace: harnessTrace,
    providerProposalReady: input.qualityReport.handoffReadiness === "exact-single-target" || input.qualityReport.handoffReadiness === "exact-hunk-set",
    providerDryRun: input.dryRun
      ? {
          promptAuditStatus: input.dryRun.promptAudit?.status,
          outputValidationStatus: input.dryRun.outputValidation?.status,
          anchorQualityLevel: input.dryRun.anchorQuality?.level,
          anchoringOutcome: input.dryRun.anchoringResult?.status,
          anchoredProposalId: input.dryRun.anchoredProposal?.anchoredProposalId,
          anchoringReviewReadiness: input.dryRun.anchoredProposal?.reviewRequirement,
          anchoringNoWrite: input.dryRun.anchoringResult?.noWrite,
          redactionStatus: input.dryRun.anchoringResult?.redactionStatus ?? "raw-content-excluded",
          noWrite: input.dryRun.mutation === "not-run" && input.dryRun.changedFiles.length === 0,
        }
      : undefined,
    providerSmoke: {
      mode: input.qualityReport.mode,
      providerKind: input.adapterApproval?.providerKind ?? input.qualityReport.providerSafeLabel,
      adapterApproved: input.adapterApproval?.adapterApproved ?? false,
      caseId: input.qualityReport.caseId,
      skipReason: input.qualityReport.skipReason,
      reportId: input.qualityReport.reportId,
      providerCalled: input.qualityReport.providerCalled,
      providerErrorClass: input.qualityReport.providerErrorClass,
      outputValidationStatus: input.qualityReport.outputValidationStatus,
      anchorQuality: input.qualityReport.anchorQuality,
      noWriteStatus: input.qualityReport.noWriteStatus,
      scorecardStatus: input.qualityReport.scorecardStatus,
    },
    resultTruthful: true,
    continuationReady: true,
  });

  const result = buildLiveProviderSmokeResult({
    runId: input.runId,
    mode: input.mode,
    providerSafeLabel: input.qualityReport.providerSafeLabel,
    providerKind: input.adapterApproval?.providerKind ?? input.qualityReport.providerSafeLabel,
    adapterApproved: input.adapterApproval?.adapterApproved ?? false,
    providerCalled: input.qualityReport.providerCalled,
    providerErrorClass: input.qualityReport.providerErrorClass,
    skipReason: input.qualityReport.skipReason,
    gateDecision: input.gate.decision,
    promptAuditId: input.dryRun?.promptAudit?.auditId ?? input.promptAudit?.auditId,
    promptAuditStatus: input.dryRun?.promptAudit?.status ?? input.promptAudit?.status,
    outputValidationId: input.dryRun?.outputValidation?.validationId,
    outputValidationStatus: input.dryRun?.outputValidation?.status,
    anchoredProposalId: input.dryRun?.anchoredProposal?.anchoredProposalId,
    anchorQuality: input.dryRun?.anchorQuality?.level,
    qualityReportId: input.qualityReport.reportId,
    scorecardId: harnessScorecard.scorecardId,
    noWriteStatus: input.qualityReport.noWriteStatus,
    redactionStatus: "raw-content-excluded" as const,
    harnessTrace,
    harnessScorecard,
    dryRunStatus: input.dryRun?.status,
  });

  const evidence = [
    ...input.normalizedEvidence.evidence,
    ...(input.adapterApproval ? input.adapterApproval.evidence : []),
    ...input.gate.evidence,
    ...(input.promptAudit ? input.promptAudit.evidence : []),
    ...(input.dryRun ? input.dryRun.evidence : []),
    ...input.qualityReport.evidence,
    ...harnessTrace.evidence,
    ...harnessScorecard.evidence,
    ...result.evidence,
    "live-smoke-calibration:mutation:not-run",
    "live-smoke-calibration:mutation-authority:not-granted",
    "live-smoke-calibration:no-apply",
    "live-smoke-calibration:provider-call-during-apply:not-run",
    "live-smoke-calibration:raw-output-excluded",
  ];

  return {
    runId: input.runId,
    mode: input.mode,
    gate: input.gate,
    promptAudit: input.promptAudit ?? null,
    dryRun: input.dryRun ?? null,
    qualityReport: input.qualityReport,
    harnessTrace,
    harnessScorecard,
    result,
    normalizedEvidence: input.normalizedEvidence,
    changedFiles: [],
    mutationAuthority: "not-granted",
    evidence,
  };
}
