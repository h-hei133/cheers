import { buildHarnessScorecard, type HarnessScorecard } from "./harnessScorecard.js";
import { buildHarnessTrace, type HarnessTrace } from "./harnessTrace.js";
import type { ContextAwareProviderPromptContext } from "../provider/request/prompt.js";
import {
  evaluateAnchoredProviderSmokeGate,
  type AnchoredProviderSmokeGate,
} from "./anchoredProviderSmokeGate.js";
import {
  PROPOSAL_QUALITY_CORPUS,
  type ProposalQualityCorpusCase,
} from "./proposalQualityCorpus.js";
import { buildProposalQualityReport, type ProposalQualityReport } from "./proposalQualityReport.js";
import { buildProviderSmokeResult, type ProviderSmokeResult } from "./providerSmokeResult.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import {
  runRealProviderProposalDryRun,
  type RealProviderProposalDryRunProvider,
  type RealProviderProposalDryRunResult,
} from "./realProviderProposalDryRun.js";

export interface AnchoredProviderSmokeRun {
  readonly runId: string;
  readonly gate: AnchoredProviderSmokeGate;
  readonly dryRuns: readonly RealProviderProposalDryRunResult[];
  readonly qualityReports: readonly ProposalQualityReport[];
  readonly harnessTrace: HarnessTrace;
  readonly harnessScorecard: HarnessScorecard;
  readonly result: ProviderSmokeResult;
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly mutation: "not-run";
  readonly evidence: readonly string[];
}

export async function runAnchoredProviderSmoke(input: {
  readonly requestId: string;
  readonly mode: "fake-corpus" | "real-provider-smoke";
  readonly explicitSmokeOptIn?: boolean;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly provider?: RealProviderProposalDryRunProvider;
  readonly promptContext?: ContextAwareProviderPromptContext;
  readonly targetLabel?: string;
  readonly currentContent?: string;
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
  readonly corpusCases?: readonly ProposalQualityCorpusCase[];
}): Promise<AnchoredProviderSmokeRun> {
  const runId = `anchored_provider_smoke_${input.requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const gate = evaluateAnchoredProviderSmokeGate({
    requestId: input.requestId,
    mode: input.mode === "fake-corpus" ? "fake-corpus" : "real-provider",
    explicitSmokeOptIn: input.explicitSmokeOptIn,
    providerAvailability: input.providerAvailability,
    lifecycleId: input.lifecycleId,
    analysisBriefId: input.analysisBriefId,
    analysisQualityId: input.analysisQualityId,
    analysisQualityDecision: input.analysisQualityDecision,
    planQualityId: input.planQualityId,
    planQualityLevel: input.planQualityLevel,
    dryRunMode: "no-write",
    redactionStatus: input.redactionStatus,
  });

  if (!gate.allowed) {
    return finishSmoke({
      runId,
      gate,
      reports: [
        buildProposalQualityReport({
          runId,
          mode: input.mode,
          providerSafeLabel: gate.providerSafeLabel,
          gate,
        }),
      ],
    });
  }

  const dryRuns = input.mode === "fake-corpus"
    ? await runFakeCorpus({ input, runId, gate })
    : [
        await runRealSmoke({
          input,
          runId,
          gate,
        }),
      ];
  const reports = dryRuns.map((dryRun, index) =>
    buildProposalQualityReport({
      runId,
      mode: input.mode,
      providerSafeLabel: gate.providerSafeLabel,
      case: input.mode === "fake-corpus" ? (input.corpusCases ?? PROPOSAL_QUALITY_CORPUS)[index] : undefined,
      gate,
      dryRun,
    }),
  );
  return finishSmoke({ runId, gate, dryRuns, reports });
}

async function runFakeCorpus(input: {
  readonly input: Parameters<typeof runAnchoredProviderSmoke>[0];
  readonly runId: string;
  readonly gate: AnchoredProviderSmokeGate;
}): Promise<readonly RealProviderProposalDryRunResult[]> {
  const cases = input.input.corpusCases ?? PROPOSAL_QUALITY_CORPUS;
  const results: RealProviderProposalDryRunResult[] = [];
  for (const corpusCase of cases) {
    results.push(
      await runRealProviderProposalDryRun({
        ...baseDryRunInput(input.input, corpusCase.caseId),
        requestId: `${input.input.requestId}-${corpusCase.caseId}`,
        providerAvailability: { kind: "available", providerKindLabel: "fake-provider" },
        provider: {
          proposeEdit: () => corpusCase.rawProposal ?? { operationKind: "generated-replacement" },
        },
        promptContext: buildSmokePrompt(input.input, corpusCase),
        explicitTargetLabels: [corpusCase.targetLabel],
        currentContentByTargetLabel: new Map([[corpusCase.targetLabel, corpusCase.currentContent]]),
        staleTargetLabels: corpusCase.staleTargetLabels,
        inWorkspaceTargetLabels: [corpusCase.targetLabel],
      }),
    );
  }
  return results;
}

async function runRealSmoke(input: {
  readonly input: Parameters<typeof runAnchoredProviderSmoke>[0];
  readonly runId: string;
  readonly gate: AnchoredProviderSmokeGate;
}): Promise<RealProviderProposalDryRunResult> {
  const targetLabel = input.input.targetLabel ?? input.input.promptContext?.target.pathLabel ?? "src/app.ts";
  const promptContext = input.input.promptContext ?? buildSmokePrompt(input.input, {
    caseId: "exact-single-target",
    taskIntentLabel: "real provider anchored smoke",
    targetLabel,
  });
  return runRealProviderProposalDryRun({
    ...baseDryRunInput(input.input, "real-provider-smoke"),
    dryRunOptIn: true,
    promptContext,
    explicitTargetLabels: [targetLabel],
    providerAvailability: input.input.providerAvailability ?? { kind: "not-configured", reason: "provider not supplied" },
    provider: input.input.provider,
    currentContentByTargetLabel: new Map([[targetLabel, input.input.currentContent ?? "export function runApp() {}\n"]]),
    inWorkspaceTargetLabels: [targetLabel],
  });
}

function finishSmoke(input: {
  readonly runId: string;
  readonly gate: AnchoredProviderSmokeGate;
  readonly dryRuns?: readonly RealProviderProposalDryRunResult[];
  readonly reports: readonly ProposalQualityReport[];
}): AnchoredProviderSmokeRun {
  const primaryDryRun = input.dryRuns?.[0];
  const primaryReport = input.reports[0];
  const harnessTrace = buildHarnessTrace({
    routeId: "route196-anchored-provider-smoke",
    taskLifecycleId: primaryDryRun?.gate.evidence.find((entry) => entry.startsWith("real-provider-proposal-gate:lifecycle:"))?.split(":").at(-1),
    analysisBriefId: primaryDryRun?.gate.evidence.find((entry) => entry.startsWith("real-provider-proposal-gate:analysis-brief:"))?.split(":").at(-1),
    planQualityId: primaryDryRun?.gate.evidence.find((entry) => entry.startsWith("real-provider-proposal-gate:plan-quality:"))?.split(":").at(-1),
    providerDryRunId: primaryDryRun?.dryRunId,
    providerDryRunGateDecision: primaryDryRun?.gate.decision ?? input.gate.decision,
    providerPromptAuditStatus: primaryDryRun?.promptAudit?.status,
    providerOutputValidationStatus: primaryDryRun?.outputValidation?.status,
    providerAnchorQualityLevel: primaryDryRun?.anchorQuality?.level,
    providerAnchoringAttempted: Boolean(primaryDryRun?.anchoringResult),
    providerAnchoringOutcome: primaryDryRun?.anchoringResult?.status,
    providerAnchoredProposalId: primaryDryRun?.anchoredProposal?.anchoredProposalId,
    providerAnchoringExactness: primaryDryRun?.anchoredProposal?.handoffReadiness,
    providerAnchoringReviewReadiness: primaryDryRun?.anchoredProposal?.reviewRequirement,
    providerAnchoringNoWrite: primaryDryRun?.anchoringResult?.noWrite,
    providerDryRunCalled: input.reports.some((report) => report.providerCalled),
    providerSmokeMode: primaryReport.mode,
    providerSmokeCaseId: primaryReport.caseId,
    providerSmokeSkipReason: primaryReport.skipReason,
    providerSmokeReportId: primaryReport.reportId,
    status: primaryReport.failureClass,
    reason: primaryDryRun?.reason ?? input.gate.reason,
    evidence: [...input.gate.evidence, ...input.reports.flatMap((report) => report.evidence)],
  });
  const harnessScorecard = buildHarnessScorecard({
    trace: harnessTrace,
    providerProposalReady: input.reports.some((report) => report.handoffReadiness === "exact-single-target" || report.handoffReadiness === "exact-hunk-set"),
    providerDryRun: primaryDryRun
      ? {
          promptAuditStatus: primaryDryRun.promptAudit?.status,
          outputValidationStatus: primaryDryRun.outputValidation?.status,
          anchorQualityLevel: primaryDryRun.anchorQuality?.level,
          anchoringOutcome: primaryDryRun.anchoringResult?.status,
          anchoredProposalId: primaryDryRun.anchoredProposal?.anchoredProposalId,
          anchoringReviewReadiness: primaryDryRun.anchoredProposal?.reviewRequirement,
          anchoringNoWrite: primaryDryRun.anchoringResult?.noWrite,
          redactionStatus: primaryDryRun.anchoringResult?.redactionStatus ?? "raw-content-excluded",
          noWrite: primaryDryRun.mutation === "not-run" && primaryDryRun.changedFiles.length === 0,
        }
      : undefined,
    providerSmoke: {
      mode: primaryReport.mode,
      caseId: primaryReport.caseId,
      skipReason: primaryReport.skipReason,
      reportId: primaryReport.reportId,
      providerCalled: input.reports.some((report) => report.providerCalled),
      noWriteStatus: primaryReport.noWriteStatus,
      scorecardStatus: primaryReport.scorecardStatus,
    },
    resultTruthful: true,
    continuationReady: true,
  });
  const result = buildProviderSmokeResult({
    runId: input.runId,
    reports: input.reports,
    harnessTrace,
    harnessScorecard,
  });
  const evidence = [
    ...input.gate.evidence,
    ...(input.dryRuns ?? []).flatMap((dryRun) => dryRun.evidence),
    ...input.reports.flatMap((report) => report.evidence),
    ...harnessTrace.evidence,
    ...harnessScorecard.evidence,
    ...result.evidence,
    `anchored-provider-smoke:run:${input.runId}`,
    "anchored-provider-smoke:mutation:not-run",
    "anchored-provider-smoke:mutation-authority:not-granted",
    "anchored-provider-smoke:no-apply",
    "anchored-provider-smoke:provider-call-during-apply:not-run",
    "anchored-provider-smoke:raw-output-excluded",
  ];

  return {
    runId: input.runId,
    gate: input.gate,
    dryRuns: input.dryRuns ?? [],
    qualityReports: input.reports,
    harnessTrace,
    harnessScorecard,
    result,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    evidence,
  };
}

function baseDryRunInput(
  input: Parameters<typeof runAnchoredProviderSmoke>[0],
  suffix: string,
) {
  return {
    requestId: `${input.requestId}-${suffix}`,
    dryRunOptIn: true,
    lifecycleId: input.lifecycleId ?? "life_196",
    analysisBriefId: input.analysisBriefId ?? "analysis_196",
    analysisQualityId: input.analysisQualityId ?? "analysis_quality_196",
    analysisQualityDecision: input.analysisQualityDecision ?? "allow",
    planQualityId: input.planQualityId ?? "plan_quality_196",
    planQualityLevel: input.planQualityLevel ?? "ready",
    contextPacketId: input.contextPacketId ?? "ctx_196",
    contextGraphId: input.contextGraphId ?? "graph_196",
    codeGraphTraceId: input.codeGraphTraceId ?? "code_trace_196",
    taskExecutionPlanId: input.taskExecutionPlanId ?? "exec_196",
    redactionStatus: input.redactionStatus ?? "redacted-and-budgeted",
  };
}

function buildSmokePrompt(
  input: Parameters<typeof runAnchoredProviderSmoke>[0],
  corpusCase: Pick<ProposalQualityCorpusCase, "caseId" | "taskIntentLabel" | "targetLabel">,
): ContextAwareProviderPromptContext {
  const requestId = `${input.requestId}-${corpusCase.caseId}`;
  return {
    requestId,
    contextPacketId: input.contextPacketId ?? "ctx_196",
    contextGraphId: input.contextGraphId ?? "graph_196",
    agentPlanId: "agent_plan_196",
    taskLifecycleId: input.lifecycleId ?? "life_196",
    analysisBriefId: input.analysisBriefId ?? "analysis_196",
    taskExecutionPlanId: input.taskExecutionPlanId ?? "exec_196",
    userRequest: corpusCase.taskIntentLabel,
    targetSummary: corpusCase.targetLabel,
    target: { pathLabel: corpusCase.targetLabel, summary: "bounded target summary" },
    relatedContext: [],
    constraints: ["return bounded old/new anchors", "do not apply changes"],
    nonGoals: ["mutation", "fuzzy apply", "provider call during apply"],
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- app"],
    omittedContentReasons: ["raw file content excluded"],
    codeGraphTraceId: input.codeGraphTraceId ?? "code_trace_196",
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt: [
      "Create a review-only provider edit proposal from explicit context.",
      `Request: ${corpusCase.taskIntentLabel}`,
      `Context packet: ${input.contextPacketId ?? "ctx_196"}`,
      `Code graph trace: ${input.codeGraphTraceId ?? "code_trace_196"}`,
      `Analysis brief: ${input.analysisBriefId ?? "analysis_196"}`,
      `Target: ${corpusCase.targetLabel}`,
      "Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
    ].join("\n"),
    evidence: [
      "context-aware-provider-prompt:redacted-and-budgeted",
      "context-aware-provider-prompt:raw-full-content-excluded",
      "context-aware-provider-prompt:mutation-authority:not-granted",
    ],
  };
}
