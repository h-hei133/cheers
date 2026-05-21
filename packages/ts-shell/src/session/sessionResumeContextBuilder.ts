import type { QueryEvent } from "../core/query/events.js";
import type {
  CodingActionResultSeed,
  CodingResultSummary,
} from "../orchestration/types.js";
import { formatPromptContinuityContext } from "./continuityFormatter.js";
import type {
  SeedInfluenceDiagnostic,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import { buildStoppedSessionFailureHandoffDiagnostic } from "./stoppedSessionContinuity.js";

export type { SeedInfluenceDiagnostic } from "./sessionContinuityTypes.js";

export function buildSessionResumeContext(input: {
  readonly currentPrompt: string;
  readonly snapshot: SessionContinuitySnapshot;
}): string | undefined {
  if (!isContinuationPrompt(input.currentPrompt)) {
    return undefined;
  }

  return formatPromptContinuityContext(input.snapshot);
}

export function buildSessionResumeSnapshot(input: {
  readonly currentPrompt: string;
  readonly snapshot: SessionContinuitySnapshot;
}): SessionContinuitySnapshot | undefined {
  if (
    isContinuationPrompt(input.currentPrompt) ||
    isReflectiveStateQueryPrompt(input.currentPrompt)
  ) {
    return input.snapshot;
  }
  if (
    shouldAutoAttachPathlessContinuation(
      input.currentPrompt,
      input.snapshot,
    )
  ) {
    return input.snapshot;
  }
  if ((input.snapshot.freshnessHistoryCount ?? 0) > 0) {
    return buildBoundaryOnlyContinuitySnapshot(input.snapshot);
  }
  return undefined;
}

export function buildBoundaryOnlyContinuitySnapshot(
  snapshot: SessionContinuitySnapshot,
): SessionContinuitySnapshot {
  return {
    sessionId: snapshot.sessionId,
    projectRoot: snapshot.projectRoot,
    ...(snapshot.lastUserIntent ? { lastUserIntent: snapshot.lastUserIntent } : {}),
    ...(snapshot.lastAssistantOutput
      ? { lastAssistantOutput: snapshot.lastAssistantOutput }
      : {}),
    ...(snapshot.lastFailure ? { lastFailure: snapshot.lastFailure } : {}),
    lastTaskKind: snapshot.lastTaskKind,
    lastTerminalClassification: snapshot.lastTerminalClassification,
    lastTerminalReason: snapshot.lastTerminalReason,
    ...(snapshot.lastSeedInfluence
      ? { lastSeedInfluence: snapshot.lastSeedInfluence }
      : {}),
    ...(snapshot.lastWriterStarted !== undefined
      ? { lastWriterStarted: snapshot.lastWriterStarted }
      : {}),
    ...(snapshot.lastWriteEffect
      ? { lastWriteEffect: snapshot.lastWriteEffect }
      : {}),
    ...(snapshot.lastWriteRequiresUserInspection !== undefined
      ? {
          lastWriteRequiresUserInspection:
            snapshot.lastWriteRequiresUserInspection,
        }
      : {}),
    ...(snapshot.lastWriteEffectTarget
      ? { lastWriteEffectTarget: snapshot.lastWriteEffectTarget }
      : {}),
    ...(snapshot.lastSeedInfluenceHandoffSummary
      ? {
          lastSeedInfluenceHandoffSummary:
            snapshot.lastSeedInfluenceHandoffSummary,
        }
      : {}),
    ...(snapshot.lastFailureHandoffDiagnostic
      ? { lastFailureHandoffDiagnostic: snapshot.lastFailureHandoffDiagnostic }
      : {}),
    ...(snapshot.lastSuccessHandoffDiagnostic
      ? { lastSuccessHandoffDiagnostic: snapshot.lastSuccessHandoffDiagnostic }
      : {}),
    ...(snapshot.lastContinuationStatus
      ? { lastContinuationStatus: snapshot.lastContinuationStatus }
      : {}),
    ...(snapshot.lastTaskSatisfactionVerdict
      ? { lastTaskSatisfactionVerdict: snapshot.lastTaskSatisfactionVerdict }
      : {}),
    recentChangedFiles: [],
    recentTargetFiles: [],
    recentFailedFiles: [],
    recentVerifiedFiles: [],
    lastRepairNotes: [],
    lastContinuationEvidence: [],
    lastTaskSatisfactionReasons: snapshot.lastTaskSatisfactionReasons.slice(0, 3),
    unresolvedItems: [],
    ...(snapshot.lastApprovalDecision
      ? { lastApprovalDecision: snapshot.lastApprovalDecision }
      : {}),
    ...(snapshot.lastApprovalDecisionSource
      ? { lastApprovalDecisionSource: snapshot.lastApprovalDecisionSource }
      : {}),
    ...(snapshot.lastApprovalPersistent !== undefined
      ? { lastApprovalPersistent: snapshot.lastApprovalPersistent }
      : {}),
    ...(snapshot.lastApprovalCacheEffect
      ? { lastApprovalCacheEffect: snapshot.lastApprovalCacheEffect }
      : {}),
    ...(snapshot.lastApprovalProjectRoot
      ? { lastApprovalProjectRoot: snapshot.lastApprovalProjectRoot }
      : {}),
    ...(snapshot.lastApprovalCacheKey
      ? { lastApprovalCacheKey: snapshot.lastApprovalCacheKey }
      : {}),
    ...(snapshot.lastApprovalScope
      ? { lastApprovalScope: snapshot.lastApprovalScope }
      : {}),
    ...(snapshot.lastApprovalLineage
      ? { lastApprovalLineage: snapshot.lastApprovalLineage }
      : {}),
    ...(snapshot.lastApprovalStopReason
      ? { lastApprovalStopReason: snapshot.lastApprovalStopReason }
      : {}),
    ...(snapshot.lastApprovalChannel
      ? { lastApprovalChannel: snapshot.lastApprovalChannel }
      : {}),
    ...(snapshot.lastApprovalInputKey
      ? { lastApprovalInputKey: snapshot.lastApprovalInputKey }
      : {}),
    ...(snapshot.lastApprovalRecordedAt
      ? { lastApprovalRecordedAt: snapshot.lastApprovalRecordedAt }
      : {}),
    ...(snapshot.lastApprovalHistory?.length
      ? { lastApprovalHistory: snapshot.lastApprovalHistory }
      : {}),
    ...(snapshot.lastApprovalProvenanceKind
      ? { lastApprovalProvenanceKind: snapshot.lastApprovalProvenanceKind }
      : {}),
    ...(snapshot.lastApprovalProvenanceSource
      ? { lastApprovalProvenanceSource: snapshot.lastApprovalProvenanceSource }
      : {}),
    ...(snapshot.lastApprovalProvenanceToolName
      ? {
          lastApprovalProvenanceToolName:
            snapshot.lastApprovalProvenanceToolName,
        }
      : {}),
    ...(snapshot.lastApprovalProvenanceTaskId
      ? { lastApprovalProvenanceTaskId: snapshot.lastApprovalProvenanceTaskId }
      : {}),
    ...(snapshot.lastToolExecutionProvenanceKind
      ? {
          lastToolExecutionProvenanceKind:
            snapshot.lastToolExecutionProvenanceKind,
        }
      : {}),
    ...(snapshot.lastToolExecutionProvenanceSource
      ? {
          lastToolExecutionProvenanceSource:
            snapshot.lastToolExecutionProvenanceSource,
        }
      : {}),
    ...(snapshot.lastToolExecutionProvenanceToolName
      ? {
          lastToolExecutionProvenanceToolName:
            snapshot.lastToolExecutionProvenanceToolName,
        }
      : {}),
    ...(snapshot.lastToolExecutionProvenanceTaskId
      ? {
          lastToolExecutionProvenanceTaskId:
            snapshot.lastToolExecutionProvenanceTaskId,
        }
      : {}),
    ...(snapshot.lastToolExecutionFailureBoundary
      ? {
          lastToolExecutionFailureBoundary:
            snapshot.lastToolExecutionFailureBoundary,
        }
      : {}),
    ...(snapshot.lastRequestScopeCacheKey
      ? { lastRequestScopeCacheKey: snapshot.lastRequestScopeCacheKey }
      : {}),
    ...(snapshot.lastRequestScopeLabel
      ? { lastRequestScopeLabel: snapshot.lastRequestScopeLabel }
      : {}),
    ...(snapshot.lastRequestScopeProjectRoot
      ? { lastRequestScopeProjectRoot: snapshot.lastRequestScopeProjectRoot }
      : {}),
    ...(snapshot.lastRequestScopeSource
      ? { lastRequestScopeSource: snapshot.lastRequestScopeSource }
      : {}),
    ...(snapshot.lastPermissionRequestToolName
      ? {
          lastPermissionRequestToolName:
            snapshot.lastPermissionRequestToolName,
        }
      : {}),
    ...(snapshot.lastPermissionRequestOperation
      ? {
          lastPermissionRequestOperation:
            snapshot.lastPermissionRequestOperation,
        }
      : {}),
    ...(snapshot.lastPermissionRequestTarget
      ? { lastPermissionRequestTarget: snapshot.lastPermissionRequestTarget }
      : {}),
    ...(snapshot.lastPermissionRequestProcess
      ? { lastPermissionRequestProcess: snapshot.lastPermissionRequestProcess }
      : {}),
    ...(snapshot.lastPermissionRequestScopeKey
      ? {
          lastPermissionRequestScopeKey:
            snapshot.lastPermissionRequestScopeKey,
        }
      : {}),
    ...(snapshot.lastPermissionRequestScopeLabel
      ? {
          lastPermissionRequestScopeLabel:
            snapshot.lastPermissionRequestScopeLabel,
        }
      : {}),
    ...(snapshot.lastPermissionRequestCacheKey
      ? {
          lastPermissionRequestCacheKey:
            snapshot.lastPermissionRequestCacheKey,
        }
      : {}),
    ...(snapshot.lastPermissionRequestProjectRoot
      ? {
          lastPermissionRequestProjectRoot:
            snapshot.lastPermissionRequestProjectRoot,
        }
      : {}),
    ...(snapshot.lastPermissionRequestSource
      ? { lastPermissionRequestSource: snapshot.lastPermissionRequestSource }
      : {}),
    ...(snapshot.lastPermissionRequestLineage
      ? { lastPermissionRequestLineage: snapshot.lastPermissionRequestLineage }
      : {}),
    ...(snapshot.freshnessHistoryCount
      ? { freshnessHistoryCount: snapshot.freshnessHistoryCount }
      : {}),
  };
}

export function shouldAutoAttachPathlessContinuation(
  prompt: string,
  snapshot: SessionContinuitySnapshot,
): boolean {
  const normalized = prompt.toLowerCase().trim();
  if (!normalized) {
    return false;
  }
  if (extractPathLikeTargets(prompt).length > 0) {
    return false;
  }
  const hasTaskTruthAnchor = Boolean(
    snapshot.lastUserIntent?.trim() ||
      snapshot.lastAssistantOutput?.trim() ||
      snapshot.lastTaskSatisfactionVerdict ||
      snapshot.lastContinuationStatus ||
      snapshot.lastFailure,
  );
  if (snapshot.recentTargetFiles.length === 0 && !hasTaskTruthAnchor) {
    return false;
  }

  const hasTemporalSuccessorIntent =
    /^(?:next|then|what\s+next|after\s+that)(?:[?.!]+)?$/i.test(normalized) ||
    /^(?:下一步|然后呢|接下来)(?:[，。?!！？]+)?$/u.test(prompt.trim());

  const hasActionIntent =
    /\b(read|inspect|open|show|explain|summari[sz]e|edit|modify|fix|repair|replace|continue|verify|test|build|same)\b/i.test(
      normalized,
    ) ||
    /(?:\u7ee7\u7eed|\u63a5\u7740|\u4fee|\u6539|\u8bfb|\u770b|\u89e3\u91ca|\u603b\u7ed3|\u8865\u9f50|\u540c\u6837)/u.test(
      prompt,
    ) ||
    hasTemporalSuccessorIntent;
  if (!hasActionIntent) {
    return false;
  }

  return Boolean(
    (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") ||
      snapshot.unresolvedItems.length > 0 ||
      snapshot.lastFailure,
  );
}

export function buildActionHandoffSummary(
  seed: CodingActionResultSeed | undefined,
): string | undefined {
  if (!seed) {
    return undefined;
  }
  const action = seed.actionKind || "previous action";
  const target = seed.target ?? seed.changedFiles?.[0] ?? seed.verifiedFiles?.[0];
  const verificationStatus = seed.verification?.status;
  const targetLabel = target ? ` on ${target}` : "";
  const focusLabel = target ? "the same target" : "the same task";
  const verificationLabel = verificationStatus
    ? `; verification status: ${verificationStatus}`
    : "";
  const writerLabel = seed.writerStarted ? "; writer-started=yes" : "";
  const writeEffectLabel = seed.writeEffect
    ? `; write-effect=${seed.writeEffect}`
    : "";
  const inspectionLabel = seed.requiresUserInspection
    ? "; requires-user-inspection=yes"
    : "";
  return `Resumed from ${action}${targetLabel}${verificationLabel}${writerLabel}${writeEffectLabel}${inspectionLabel}; next focus is ${focusLabel}.`;
}

export function buildSeedInfluenceHandoffSummary(
  seed: CodingActionResultSeed | undefined,
  influence: SeedInfluenceDiagnostic | undefined,
): string | undefined {
  if (!seed || !influence) {
    return undefined;
  }
  const action = seed.actionKind || "previous action";
  const target = seed.target ?? seed.changedFiles?.[0] ?? seed.verifiedFiles?.[0];
  const targetLabel = target ? ` on ${target}` : "";
  return `Seed influence: ${influence} from ${action}${targetLabel}.`;
}

export function buildSuccessHandoffDiagnostic(
  codingResult:
    | NonNullable<Extract<QueryEvent, { type: "query.completed" }>["result"]["codingResult"]>
    | CodingResultSummary
    | undefined,
): string | undefined {
  if (!codingResult) {
    return undefined;
  }
  if (buildStoppedSessionFailureHandoffDiagnostic(codingResult)) {
    return undefined;
  }

  const seed = codingResult.lastActionResultSeed;
  const status = seed?.verification?.status ?? codingResult.verification.status;
  if (status !== "passed") {
    return undefined;
  }

  const command = seed?.verification?.command ?? codingResult.verification.command;
  const verifiedFiles = Array.from(
    new Set([...(seed?.verifiedFiles ?? []), ...codingResult.verifiedFiles]),
  );
  const target =
    seed?.target ??
    verifiedFiles[0] ??
    codingResult.changedFiles[0] ??
    codingResult.changeSet.attemptedFiles[0];
  if (!command && !target && verifiedFiles.length === 0) {
    return undefined;
  }

  const reason = seed?.verification?.reason ?? codingResult.verification.reason;
  const nextFocus = target
    ? "keep the next turn focused on the same target; do not repeat this verification unless the target changes"
    : "do not repeat this verification unless the verification scope changes";
  const parts = ["Success handoff: status=passed"];
  if (target) {
    parts.push(`target=${target}`);
  }
  if (command) {
    parts.push(`command=${command}`);
  }
  if (verifiedFiles.length > 0) {
    parts.push(`verified=${verifiedFiles.slice(0, 4).join(",")}`);
  }
  if (reason) {
    parts.push(`reason=${compactText(reason, 140)}`);
  }
  if (codingResult.recoverySurface?.explicitRestoreAvailable) {
    parts.push("snapshot=created");
    parts.push("restore-preview=available");
  }
  if (codingResult.recoverySurface) {
    parts.push("automatic-rollback=no");
  }
  const discoverySummary = extractDiscoveryEditContinuationSummary(codingResult);
  if (discoverySummary) {
    parts.push(discoverySummary);
  }
  const generatedSummary = extractGeneratedEditContinuationSummary(codingResult);
  if (generatedSummary) {
    parts.push(generatedSummary);
  }
  const providerEditSummary = extractProviderEditContinuationSummary(codingResult);
  if (providerEditSummary) {
    parts.push(providerEditSummary);
  }
  const proposalReviewSummary = extractEditProposalReviewContinuationSummary(codingResult);
  if (proposalReviewSummary) {
    parts.push(proposalReviewSummary);
  }
  const proposalApplySummary = extractEditProposalApplyContinuationSummary(codingResult);
  if (proposalApplySummary) {
    parts.push(proposalApplySummary);
  }
  parts.push(`next=${nextFocus}`);
  return `${parts.join("; ")}.`;
}

export function isContinuationPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().trim();
  if (normalized.length === 0) {
    return false;
  }
  const hasExplicitTarget = extractPathLikeTargets(prompt).length > 0;
  const hasStagedFollowUpConnector =
    /\b(first|then|and then)\b/i.test(normalized) ||
    /(?:鍏坾鐒跺悗|鍐峾骞惰В閲妡骞惰鏄巪骞惰ˉ)/u.test(prompt);
  const hasGroundedRepairSignal =
    /\b(summarize|summary|explain|read|conclusion|evidence|risk)\b/i.test(
      normalized,
    ) ||
    /(?:鎬荤粨|鎽樿|瑙ｉ噴|璇诲彇|缁撹|渚濇嵁|鍏抽敭椋庨櫓|杈撳叆杈撳嚭)/u.test(prompt);
  if (!hasExplicitTarget && hasStagedFollowUpConnector && hasGroundedRepairSignal) {
    return true;
  }

  const hasDeicticFollowUpCue =
    /\b(this file|that file|same file|this issue|that issue|same issue|this task|that task|same task|this one|that one)\b/i.test(
      normalized,
    ) ||
    /(?:\u8fd9\u4e2a\u6587\u4ef6|\u90a3\u4e2a\u6587\u4ef6|\u540c\u4e00\u4e2a\u6587\u4ef6|\u8fd9\u4e2a\u95ee\u9898|\u90a3\u4e2a\u95ee\u9898|\u540c\u4e00\u4e2a\u95ee\u9898|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u540c\u4e00\u4e2a\u4efb\u52a1|\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6)/u.test(
      prompt,
    );
  if (hasDeicticFollowUpCue) {
    return true;
  }

  const hasCorrectionCue =
    /\b(not this|not what i asked|not that edit|keep first line|only second line|redo previous answer|re-answer|reanswer|revise last answer|not method|just summarize|same target)\b/i.test(
      normalized,
    ) ||
    /(?:\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d|\u6211\u8981\u7684\u662f|\u4e0d\u662f.*\u800c\u662f|\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u4e0d\u662f\u65b9\u6cd5|\u76f4\u63a5\u7ed9\u6458\u8981|\u91cd\u7b54\u4e0a\u4e00\u9898|\u91cd\u65b0\u603b\u7ed3|\u4f60\u8fd8\u662f\u6ca1\u6709\u5386\u53f2\u8bb0\u5f55)/u.test(
      prompt,
    );
  if (hasCorrectionCue) {
    return true;
  }

  const hasExplainToMutationCue =
    /\b(?:(?:change|fix|update|replace|modify)\s+(?:that|this)\s+(?:part|section)|(?:change|fix|update|replace|modify).+\s+in\s+(?:that|this)\s+(?:part|section)|fix the part you just explained|change the part you just explained)\b/i.test(
      normalized,
    ) ||
    /(?:改(?:这部分|这一段|这段|刚才那段)|修(?:这部分|这一段|这段|刚才那段)|把刚才解释的那段(?:里|中的)?.*(?:改成|改为|替换为)|就改这部分)/u.test(
      prompt,
    );
  if (hasExplainToMutationCue) {
    return true;
  }

  const hasRecommendationHandoffCue =
    /\b(?:what should we do next|what should i do next|do that|continue with that|do it)\b/i.test(
      normalized,
    ) ||
    /(?:现在应该继续什么|下一步做什么|接下来该做什么|那就按这个继续|按这个继续|那就这么做)/u.test(
      prompt,
    );
  if (hasRecommendationHandoffCue) {
    return true;
  }

  if (isReflectiveStateQueryPrompt(prompt)) {
    return true;
  }

  if (
    /\b(continue|continuation|follow up|follow-up|previous|last run|last failure|same issue|keep going|resume|pick up|try again|finish the rest|use the previous failure|use the failed one|continue but not that|repair the other one|not that one|other related file)\b/i.test(
      normalized,
    ) ||
    /(?:\u7ee7\u7eed|\u63a5\u7740|\u521a\u624d|\u4e0a\u4e00\u8f6e|\u4e0a\u4e00\u6b21|\u4e0a\u4e2a\u95ee\u9898|\u7ee7\u7eed\u4fee|\u63a5\u7740\u4fee|\u5ef6\u7eed|\u4e0d\u8981\u518d\u8d70\u521a\u624d|\u518d\u8bd5\u4e00\u6b21|\u8865\u9f50\u5269\u4e0b|\u7528\u4e0a\u4e00\u6b21\u5931\u8d25)/u.test(
      prompt,
    )
  ) {
    return true;
  }

  const continuationSignals = [
    "continue",
    "continuation",
    "follow up",
    "follow-up",
    "same issue",
    "previous",
    "last run",
    "last failure",
    "keep going",
    "try again",
    "finish the rest",
    "use the previous failure",
    "use the failed one",
    "continue but not that",
    "repair the other one",
    "not that one",
    "other related file",
    "not that edit",
    "keep first line",
    "only second line",
    "\u63a5\u7740",
    "\u7ee7\u7eed",
    "\u521a\u624d",
    "\u4e0a\u4e00\u8f6e",
    "\u4e0a\u4e00\u6b21",
    "\u4e0a\u4e2a\u95ee\u9898",
    "\u6211\u8981\u7684\u662f",
    "\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d",
    "\u4e0d\u662f\u8fd9\u4e48\u6539",
    "\u91cd\u7b54\u4e0a\u4e00\u9898",
    "\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6",
    "\u7ee7\u7eed\u4fee\u521a\u624d\u90a3\u4e2a\u5931\u8d25",
    "\u4e0d\u8981\u518d\u8d70\u521a\u624d",
    "\u518d\u8bd5\u4e00\u6b21",
    "\u8865\u9f50\u5269\u4e0b",
    "\u7528\u4e0a\u4e00\u6b21\u5931\u8d25",
  ];

  return continuationSignals.some((signal) => normalized.includes(signal));
}

export function isReflectiveStateQueryPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  const hasEnglishPermissionReflectiveQuery =
    /\b(?:what did i just approve|what did i approve|was that allow-once or allow-always|was that cached or one-shot|why is it asking again|did that get persisted|was that persisted)\b/i.test(
      normalized,
    );
  const hasChinesePermissionReflectiveQuery =
    /(?:刚才我批准了什么|刚才那个是一次性还是永久授权|为什么这次又要问审批|刚才那个授权有没有落盘|刚才那个授权是缓存还是一次性)/u.test(
      prompt,
    );

  return (
    /\b(?:why did it stop|why did we stop|what failed|where did we stop|where did we stop reading|where did i stop reading|what should we do next|what should i do next|what part did you just explain|which part did you just explain)\b/i.test(
      normalized,
    ) ||
    /(?:刚才为什么停了|为什么停了|刚才失败的是哪一步|上一步失败在哪|刚才卡在哪|刚才解释的是哪一段|你刚才解释的是哪个片段|刚才读到哪里了|读到哪了|现在应该继续什么|下一步做什么|接下来该做什么)/u.test(
      prompt,
    ) ||
    hasEnglishPermissionReflectiveQuery ||
    hasChinesePermissionReflectiveQuery
  );
}

export function extractPathLikeTargets(input?: string): string[] {
  if (!input?.trim()) {
    return [];
  }

  const absoluteOrRelativeMatches =
    input.match(
      /(?:\.{1,2}[\\/]|[A-Za-z]:[\\/])[\w\-./\\]+(?:\.[A-Za-z0-9]+)?/g,
    ) ?? [];
  const slashPathMatches =
    input.match(
      /(?:^|[\s"'`(])((?:[\w.-]+[\\/])+[\w.-]+(?:\.[A-Za-z0-9]{1,8})?)(?=$|[\s"'`),.;:!?])/g,
    ) ?? [];
  const fileNameWithExtensionMatches =
    input.match(
      /(?:^|[\s"'`(])([\w.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s"'`),.;:!?])/g,
    ) ?? [];

  const rawMatches = [
    ...absoluteOrRelativeMatches,
    ...slashPathMatches.map((entry) => entry.trim()),
    ...fileNameWithExtensionMatches.map((entry) => entry.trim()),
  ];

  return Array.from(
    new Set(
      rawMatches
        .map((value) => normalizePathLikeTarget(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizePathLikeTarget(value: string): string | undefined {
  const trimmed = value
    .trim()
    .replace(/^[\s"'`(]+/, "")
    .replace(/[\s"'`),.;:!?]+$/, "")
    .replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("://")) {
    return undefined;
  }
  if (!/[./\\]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function compactText(input: string, max: number = 220): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}

function extractDiscoveryEditContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("discovery-edit manifest="),
  );
  if (!summary) {
    return undefined;
  }
  return `discovery=${compactText(summary, 300)}`;
}

function extractGeneratedEditContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("generated-edit proposal="),
  ) ?? codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("generated-edit handoff="),
  );
  if (!summary) {
    return undefined;
  }
  return `generated=${compactText(summary, 300)}`;
}

function extractProviderEditContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("provider-edit proposal="),
  );
  if (!summary) {
    return undefined;
  }
  return `provider-edit=${compactText(summary, 300)}`;
}

function extractEditProposalReviewContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("edit-proposal-review proposal="),
  );
  if (!summary) {
    return undefined;
  }
  return `proposal-review=${compactText(summary, 300)}`;
}

function extractEditProposalApplyContinuationSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const summary = codingResult.continuation.evidence.find((entry) =>
    entry.startsWith("edit-proposal-apply proposal="),
  );
  if (!summary) {
    return undefined;
  }
  return `proposal-apply=${compactText(summary, 300)}`;
}
