import { normalizeReadFragmentLineIndexes } from "../context/readWindowContinuation.js";
import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";

export function extractInlineContinuityContext(prompt: string): {
  cleanPrompt: string;
  inlineState: ContinuityStateLike;
} {
  const match = prompt.match(
    /\[FOLLOW-UP CONTINUITY CONTEXT\]([\s\S]*?)\[END CONTINUITY CONTEXT\]/i,
  );
  if (!match) {
    return {
      cleanPrompt: prompt,
      inlineState: {},
    };
  }

  const block = match[1] ?? "";
  const inlineState: ContinuityStateLike = {};
  const targetMatch = block.match(/recent-target-files:\s*(.+)/i);
  if (targetMatch?.[1]) {
    inlineState.recentTargetFiles = targetMatch[1]
      .split(",")
      .map((entry) => normalizeInlinePathLike(entry.trim()))
      .filter((entry) => entry.length > 0);
  }
  const failedMatch = block.match(/recent-failed-files:\s*(.+)/i);
  if (failedMatch?.[1]) {
    inlineState.recentFailedFiles = failedMatch[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => ({
        path: normalizeInlinePathLike((entry.split("(")[0] ?? entry).trim()),
        reason: entry,
      }));
  }
  const evidenceMatch = block.match(/last-continuation-evidence:\s*(.+)/i);
  if (evidenceMatch?.[1]) {
    inlineState.lastContinuationEvidence = evidenceMatch[1]
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  const deliverableModeMatch = block.match(
    /last-grounded-deliverable-mode:\s*(.+)/i,
  );
  if (deliverableModeMatch?.[1]) {
    const mode = deliverableModeMatch[1].trim().toLowerCase();
    if (mode === "read" || mode === "summary" || mode === "explain") {
      inlineState.lastGroundedDeliverableMode = mode;
    }
  }
  const deliveredLinesMatch = block.match(
    /last-read-delivered-lines:\s*(\d+)/i,
  );
  if (deliveredLinesMatch?.[1]) {
    const parsed = Number.parseInt(deliveredLinesMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadDeliveredLines = parsed;
    }
  }
  const readWindowStartMatch = block.match(/last-read-window-start:\s*(\d+)/i);
  if (readWindowStartMatch?.[1]) {
    const parsed = Number.parseInt(readWindowStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadWindowStart = parsed;
    }
  }
  const readWindowEndMatch = block.match(/last-read-window-end:\s*(\d+)/i);
  if (readWindowEndMatch?.[1]) {
    const parsed = Number.parseInt(readWindowEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadWindowEnd = parsed;
    }
  }
  const readWindowSizeMatch = block.match(/last-read-window-size:\s*(\d+)/i);
  if (readWindowSizeMatch?.[1]) {
    const parsed = Number.parseInt(readWindowSizeMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastReadWindowSize = parsed;
    }
  }
  const readFragmentStartMatch = block.match(
    /last-read-fragment-start:\s*(\d+)/i,
  );
  if (readFragmentStartMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentStart = parsed;
    }
  }
  const readFragmentEndMatch = block.match(/last-read-fragment-end:\s*(\d+)/i);
  if (readFragmentEndMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentEnd = parsed;
    }
  }
  const readFragmentIndexesMatch = block.match(
    /last-read-fragment-line-indexes:\s*([0-9,\s]+)/i,
  );
  if (readFragmentIndexesMatch?.[1]) {
    const parsed = normalizeReadFragmentLineIndexes(
      readFragmentIndexesMatch[1]
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10)),
    );
    if (parsed.length > 0) {
      inlineState.lastReadFragmentLineIndexes = parsed;
    }
  }
  const readFragmentRangesMatch = block.match(
    /last-read-fragment-ranges:\s*([0-9;,\s-]+)/i,
  );
  if (readFragmentRangesMatch?.[1]) {
    const ranges = readFragmentRangesMatch[1]
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (ranges.length > 0) {
      inlineState.lastReadFragmentRanges = ranges;
    }
  }
  const readFragmentSourceStartMatch = block.match(
    /last-read-fragment-source-window-start:\s*(\d+)/i,
  );
  if (readFragmentSourceStartMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentSourceStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentSourceWindowStart = parsed;
    }
  }
  const readFragmentSourceEndMatch = block.match(
    /last-read-fragment-source-window-end:\s*(\d+)/i,
  );
  if (readFragmentSourceEndMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentSourceEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentSourceWindowEnd = parsed;
    }
  }
  const readFilterMatch = block.match(
    /last-read-filter:\s*(none|function-definitions)/i,
  );
  if (readFilterMatch?.[1]) {
    inlineState.lastReadFilter = readFilterMatch[1].trim().toLowerCase() as
      | "none"
      | "function-definitions";
  }
  const readFragmentFingerprintMatch = block.match(
    /last-read-fragment-fingerprint:\s*([0-9a-f]{64})/i,
  );
  if (readFragmentFingerprintMatch?.[1]) {
    inlineState.lastReadFragmentFingerprint = readFragmentFingerprintMatch[1]
      .trim()
      .toLowerCase();
  }
  const stagedStepCountMatch = block.match(
    /last-staged-repair-steps:\s*(\d+)/i,
  );
  if (stagedStepCountMatch?.[1]) {
    const parsed = Number.parseInt(stagedStepCountMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairStepCount = parsed;
    }
  }
  const stagedCompletedStepMatch = block.match(
    /last-staged-repair-completed-step:\s*(\d+)/i,
  );
  if (stagedCompletedStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedCompletedStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastStagedRepairCompletedStep = parsed;
    }
  }
  const stagedBlockedStepMatch = block.match(
    /last-staged-repair-blocked-step:\s*(\d+)/i,
  );
  if (stagedBlockedStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedBlockedStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairBlockedStep = parsed;
    }
  }
  const stagedNextStepMatch = block.match(
    /last-staged-repair-next-step:\s*(\d+)/i,
  );
  if (stagedNextStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedNextStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairNextStep = parsed;
    }
  }
  const answerDefectMatch = block.match(/last-answer-defect:\s*(.+)/i);
  if (answerDefectMatch?.[1]) {
    const defect = answerDefectMatch[1].trim();
    if (defect.length > 0) {
      inlineState.lastAnswerDefect = defect;
    }
  }
  const lastFailureMatch = block.match(/last-failure:\s*(.+)/i);
  if (lastFailureMatch?.[1]) {
    const failure = lastFailureMatch[1].trim();
    if (failure.length > 0) {
      inlineState.lastFailure = failure;
    }
  }
  const lastVerificationCommandMatch = block.match(
    /last-verification-command:\s*(.+)/i,
  );
  if (lastVerificationCommandMatch?.[1]) {
    const command = lastVerificationCommandMatch[1].trim();
    if (command.length > 0) {
      inlineState.lastVerificationCommand = command;
    }
  }
  const lastVerificationReasonMatch = block.match(
    /last-verification-reason:\s*(.+)/i,
  );
  if (lastVerificationReasonMatch?.[1]) {
    const reason = lastVerificationReasonMatch[1].trim();
    if (reason.length > 0) {
      inlineState.lastVerificationReason = reason;
    }
  }
  const lastVerificationBlockerKindMatch = block.match(
    /last-verification-blocker-kind:\s*(.+)/i,
  );
  if (lastVerificationBlockerKindMatch?.[1]) {
    const kind = lastVerificationBlockerKindMatch[1].trim();
    if (kind.length > 0) {
      inlineState.lastVerificationBlockerKind = kind;
    }
  }
  const lastVerificationNextActionMatch = block.match(
    /last-verification-next-action:\s*(.+)/i,
  );
  if (lastVerificationNextActionMatch?.[1]) {
    const nextAction = lastVerificationNextActionMatch[1].trim();
    if (nextAction.length > 0) {
      inlineState.lastVerificationNextAction = nextAction;
    }
  }
  const lastVerificationResumeEligibleMatch = block.match(
    /last-verification-resume-eligible:\s*(.+)/i,
  );
  if (lastVerificationResumeEligibleMatch?.[1]) {
    const normalized = lastVerificationResumeEligibleMatch[1]
      .trim()
      .toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) {
      inlineState.lastVerificationResumeEligible = true;
    } else if (["no", "false", "0"].includes(normalized)) {
      inlineState.lastVerificationResumeEligible = false;
    }
  }
  const lastApprovalDecisionMatch = block.match(
    /last-approval-decision:\s*(.+)/i,
  );
  if (lastApprovalDecisionMatch?.[1]) {
    const decision = lastApprovalDecisionMatch[1].trim().toLowerCase();
    if (
      decision === "deny" ||
      decision === "allow-once" ||
      decision === "allow-always"
    ) {
      inlineState.lastApprovalDecision = decision;
    }
  }
  const lastApprovalDecisionSourceMatch = block.match(
    /last-approval-decision-source:\s*(.+)/i,
  );
  if (lastApprovalDecisionSourceMatch?.[1]) {
    const source = lastApprovalDecisionSourceMatch[1].trim();
    if (source.length > 0) {
      inlineState.lastApprovalDecisionSource = source;
    }
  }
  const lastApprovalPersistentMatch = block.match(
    /last-approval-persistent:\s*(.+)/i,
  );
  if (lastApprovalPersistentMatch?.[1]) {
    const normalized = lastApprovalPersistentMatch[1].trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) {
      inlineState.lastApprovalPersistent = true;
    } else if (["no", "false", "0"].includes(normalized)) {
      inlineState.lastApprovalPersistent = false;
    }
  }
  const lastApprovalCacheEffectMatch = block.match(
    /last-approval-cache-effect:\s*(.+)/i,
  );
  if (lastApprovalCacheEffectMatch?.[1]) {
    const cacheEffect = lastApprovalCacheEffectMatch[1].trim();
    if (cacheEffect.length > 0) {
      inlineState.lastApprovalCacheEffect = cacheEffect;
    }
  }
  const lastApprovalProjectRootMatch = block.match(
    /last-approval-project-root:\s*(.+)/i,
  );
  if (lastApprovalProjectRootMatch?.[1]) {
    const approvalRoot = lastApprovalProjectRootMatch[1].trim();
    if (approvalRoot.length > 0) {
      inlineState.lastApprovalProjectRoot = approvalRoot;
    }
  }
  const lastApprovalCacheKeyMatch = block.match(
    /last-approval-cache-key:\s*(.+)/i,
  );
  if (lastApprovalCacheKeyMatch?.[1]) {
    const cacheKey = lastApprovalCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastApprovalCacheKey = cacheKey;
    }
  }
  const lastApprovalScopeMatch = block.match(/last-approval-scope:\s*(.+)/i);
  if (lastApprovalScopeMatch?.[1]) {
    const scope = lastApprovalScopeMatch[1].trim();
    if (scope.length > 0) {
      inlineState.lastApprovalScope = scope;
    }
  }
  const lastApprovalLineageMatch = block.match(
    /last-approval-lineage:\s*(.+)/i,
  );
  if (lastApprovalLineageMatch?.[1]) {
    const lineage = lastApprovalLineageMatch[1].trim();
    if (lineage.length > 0) {
      inlineState.lastApprovalLineage = lineage;
    }
  }
  const lastApprovalChannelMatch = block.match(
    /last-approval-channel:\s*(.+)/i,
  );
  if (lastApprovalChannelMatch?.[1]) {
    const channel = lastApprovalChannelMatch[1].trim().toLowerCase();
    if (channel === "interactive" || channel === "non-interactive") {
      inlineState.lastApprovalChannel = channel;
    }
  }
  const lastApprovalInputKeyMatch = block.match(
    /last-approval-input-key:\s*(.+)/i,
  );
  if (lastApprovalInputKeyMatch?.[1]) {
    const inputKey = lastApprovalInputKeyMatch[1].trim().toLowerCase();
    if (
      inputKey === "y" ||
      inputKey === "a" ||
      inputKey === "n" ||
      inputKey === "other"
    ) {
      inlineState.lastApprovalInputKey = inputKey;
    }
  }
  const lastApprovalStopReasonMatch = block.match(
    /last-approval-stop-reason:\s*(.+)/i,
  );
  if (lastApprovalStopReasonMatch?.[1]) {
    const stopReason = lastApprovalStopReasonMatch[1].trim();
    if (stopReason.length > 0) {
      inlineState.lastApprovalStopReason = stopReason;
    }
  }
  const lastApprovalRecordedAtMatch = block.match(
    /last-approval-recorded-at:\s*(.+)/i,
  );
  if (lastApprovalRecordedAtMatch?.[1]) {
    const recordedAt = lastApprovalRecordedAtMatch[1].trim();
    if (recordedAt.length > 0) {
      inlineState.lastApprovalRecordedAt = recordedAt;
    }
  }
  const lastPermissionRequestToolMatch = block.match(
    /last-permission-request-tool:\s*(.+)/i,
  );
  if (lastPermissionRequestToolMatch?.[1]) {
    const tool = lastPermissionRequestToolMatch[1].trim().toLowerCase();
    if (tool.length > 0) {
      inlineState.lastPermissionRequestToolName = tool;
    }
  }
  const lastPermissionRequestOperationMatch = block.match(
    /last-permission-request-operation:\s*(.+)/i,
  );
  if (lastPermissionRequestOperationMatch?.[1]) {
    const operation = lastPermissionRequestOperationMatch[1]
      .trim()
      .toLowerCase();
    if (operation.length > 0) {
      inlineState.lastPermissionRequestOperation = operation;
    }
  }
  const lastPermissionRequestTargetMatch = block.match(
    /last-permission-request-target:\s*(.+)/i,
  );
  if (lastPermissionRequestTargetMatch?.[1]) {
    const target = lastPermissionRequestTargetMatch[1].trim();
    if (target.length > 0) {
      inlineState.lastPermissionRequestTarget = target;
    }
  }
  const lastPermissionRequestProcessMatch = block.match(
    /last-permission-request-process:\s*(.+)/i,
  );
  if (lastPermissionRequestProcessMatch?.[1]) {
    const process = lastPermissionRequestProcessMatch[1].trim().toLowerCase();
    if (process.length > 0) {
      inlineState.lastPermissionRequestProcess = process;
    }
  }
  const lastPermissionRequestScopeKeyMatch = block.match(
    /last-permission-request-scope-key:\s*(.+)/i,
  );
  if (lastPermissionRequestScopeKeyMatch?.[1]) {
    const scopeKey = lastPermissionRequestScopeKeyMatch[1].trim().toLowerCase();
    if (scopeKey.length > 0) {
      inlineState.lastPermissionRequestScopeKey = scopeKey;
    }
  }
  const lastPermissionRequestScopeLabelMatch = block.match(
    /last-permission-request-scope-label:\s*(.+)/i,
  );
  if (lastPermissionRequestScopeLabelMatch?.[1]) {
    const scopeLabel = lastPermissionRequestScopeLabelMatch[1].trim();
    if (scopeLabel.length > 0) {
      inlineState.lastPermissionRequestScopeLabel = scopeLabel;
    }
  }
  const lastPermissionRequestCacheKeyMatch = block.match(
    /last-permission-request-cache-key:\s*(.+)/i,
  );
  if (lastPermissionRequestCacheKeyMatch?.[1]) {
    const cacheKey = lastPermissionRequestCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastPermissionRequestCacheKey = cacheKey;
    }
  }
  const lastPermissionRequestProjectRootMatch = block.match(
    /last-permission-request-project-root:\s*(.+)/i,
  );
  if (lastPermissionRequestProjectRootMatch?.[1]) {
    const root = lastPermissionRequestProjectRootMatch[1].trim();
    if (root.length > 0) {
      inlineState.lastPermissionRequestProjectRoot = root;
    }
  }
  const lastPermissionRequestSourceMatch = block.match(
    /last-permission-request-source:\s*(.+)/i,
  );
  if (lastPermissionRequestSourceMatch?.[1]) {
    const source = lastPermissionRequestSourceMatch[1].trim().toLowerCase();
    if (source === "verification-command" || source === "approval-request") {
      inlineState.lastPermissionRequestSource = source;
    }
  }
  const lastPermissionRequestLineageMatch = block.match(
    /last-permission-request-lineage:\s*(.+)/i,
  );
  if (lastPermissionRequestLineageMatch?.[1]) {
    const lineage = lastPermissionRequestLineageMatch[1].trim();
    if (lineage.length > 0) {
      inlineState.lastPermissionRequestLineage = lineage;
    }
  }
  const lastRequestScopeCacheKeyMatch = block.match(
    /last-request-scope-cache-key:\s*(.+)/i,
  );
  if (lastRequestScopeCacheKeyMatch?.[1]) {
    const cacheKey = lastRequestScopeCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastRequestScopeCacheKey = cacheKey;
    }
  }
  const lastRequestScopeLabelMatch = block.match(
    /last-request-scope-label:\s*(.+)/i,
  );
  if (lastRequestScopeLabelMatch?.[1]) {
    const scope = lastRequestScopeLabelMatch[1].trim();
    if (scope.length > 0) {
      inlineState.lastRequestScopeLabel = scope;
    }
  }
  const lastRequestScopeProjectRootMatch = block.match(
    /last-request-scope-project-root:\s*(.+)/i,
  );
  if (lastRequestScopeProjectRootMatch?.[1]) {
    const root = lastRequestScopeProjectRootMatch[1].trim();
    if (root.length > 0) {
      inlineState.lastRequestScopeProjectRoot = root;
    }
  }
  const lastRequestScopeSourceMatch = block.match(
    /last-request-scope-source:\s*(.+)/i,
  );
  if (lastRequestScopeSourceMatch?.[1]) {
    const source = lastRequestScopeSourceMatch[1].trim().toLowerCase();
    if (source === "verification-command" || source === "approval-request") {
      inlineState.lastRequestScopeSource = source;
    }
  }
  const lastRepairStatusMatch = block.match(/last-repair-status:\s*(.+)/i);
  if (lastRepairStatusMatch?.[1]) {
    const status = lastRepairStatusMatch[1].trim();
    if (status.length > 0) {
      inlineState.lastRepairStatus = status;
    }
  }
  const lastContinuationStatusMatch = block.match(
    /last-continuation-status:\s*(.+)/i,
  );
  if (lastContinuationStatusMatch?.[1]) {
    const status = lastContinuationStatusMatch[1].trim();
    if (status.length > 0) {
      inlineState.lastContinuationStatus = status;
    }
  }

  return {
    cleanPrompt: prompt.replace(match[0], "").trim(),
    inlineState,
  };
}

function normalizeInlinePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
