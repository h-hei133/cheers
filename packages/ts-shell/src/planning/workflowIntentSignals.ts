import { hasLocalSliceExplainCue } from "../context/readWindowContinuation.js";
import {
  hasWorkflowLocalExplainEvidence,
  hasWorkflowReadFragmentEvidence,
} from "../orchestration/continuationModule.js";
import { classifyReadInspectRequest } from "../orchestration/readInspectModule.js";
import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import type { ReflectiveStateQueryKind } from "../orchestration/workflowTaskPlanner.js";
import { projectWorkflowIntent } from "../orchestration/workflowIntentProjection.js";
import {
  detectVerifyCommand,
  hasExternalVerifyOptOut,
} from "../policy/commandIntentPolicy.js";
import {
  isPostEditReadOnlyVerifyFollowUp,
  isVerifyContinuationFollowUpPrompt,
  prefersTestOverBuildInFollowUp,
} from "../verification/verifyContinuationPlanning.js";
import { detectUnsupportedCommandForPlanning } from "../verification/commandIntentPlanning.js";
import { extractReplaceDirective } from "../edit/mutationInstructionPlanner.js";
import { parseGroundedRepairConstraints } from "../repair/groundedAnswerRepair.js";
import {
  hasExplicitExecutionIntent,
  stripPathTokensForIntent,
} from "./promptTargetProjection.js";

export interface WorkflowTaskIntentSignals {
  readonly normalized: string;
  readonly intentPrompt: string;
  readonly groundedIntentPrompt: string;
  readonly hasContextSeedPrefix: boolean;
  readonly hasExplicitBoundaryResetPrompt: boolean;
  readonly hasFileReadIntent: boolean;
  readonly hasTargetedFileReadIntent: boolean;
  readonly hasRepositoryInspectIntent: boolean;
  readonly hasSummarizeIntent: boolean;
  readonly hasExplainIntent: boolean;
  readonly hasReflectiveExplainStateQuestion: boolean;
  readonly hasReflectiveExplainContinuation: boolean;
  readonly hasReflectiveExplainQuery: boolean;
  readonly detectedReflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly hasReflectiveActionCue: boolean;
  readonly hasPriorLocalExplainEvidence: boolean;
  readonly hasRecoverableReadFragmentEvidence: boolean;
  readonly hasLocalExplainCue: boolean;
  readonly hasGroundedReadLikeIntent: boolean;
  readonly hasGroundedConstraintCue: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasEditIntentRaw: boolean;
  readonly hasEditIntent: boolean;
  readonly hasVerifyIntent: boolean;
  readonly hasCorrectionCue: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasAnswerRepairCue: boolean;
  readonly isAmbiguousRepairFollowUp: boolean;
  readonly hasDiagnosisIntent: boolean;
  readonly hasWeakRepairFollowUp: boolean;
  readonly avoidPreviousDirection: boolean;
  readonly hasCrossFileCue: boolean;
  readonly hasVerifyContinuationCue: boolean;
  readonly verifyCommand?: string;
  readonly preferTestOverBuild: boolean;
  readonly effectiveVerifyCommand?: string;
  readonly effectiveReplaceDirectiveFromPrompt?: { from: string; to: string };
  readonly hasExecutionIntent: boolean;
  readonly unsupportedCommand?: string;
}

export function removeNegatedMutationInstructions(prompt: string): string {
  return prompt
    .replace(
      /\b(?:do\s+not|don't|dont|never)\s+(?:edit|modify|change|touch|update|write|replace|fix)\b[^.!?\n]*(?:[.!?]|$)/gi,
      " ",
    )
    .replace(
      /\bno\s+(?:edits?|modifications?|changes?|writes?|replacements?|fixes?)\b[^.!?\n]*(?:[.!?]|$)/gi,
      " ",
    );
}

export function extractWorkflowTaskIntentSignals(
  prompt: string,
  continuity: ContinuityStateLike,
): WorkflowTaskIntentSignals {
  const normalized = prompt.toLowerCase();
  const intentPrompt = stripPathTokensForIntent(prompt);
  const groundedIntentPrompt = intentPrompt.length > 0 ? intentPrompt : prompt;
  const hasContextSeedPrefix =
    /^\s*(?:previous|prior|last)\s+task\s+context\s*:/i.test(prompt);
  const hasExplicitBoundaryResetPrompt =
    /\b(?:do\s+not|don't|not)\s+continue\s+(?:the\s+)?old\s+edit\b/i.test(
      prompt,
    ) || /\bboundary\s+reset\b/i.test(prompt);
  const readInspectIntent = classifyReadInspectRequest(groundedIntentPrompt);
  const hasFileReadIntent = readInspectIntent.hasFileReadIntent;
  const hasTargetedFileReadIntent =
    readInspectIntent.hasTargetedFileReadIntent;
  const hasRepositoryInspectIntent =
    readInspectIntent.hasRepositoryInspectIntent;
  const hasSummarizeIntent =
    /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
      groundedIntentPrompt,
    );
  const hasExplainIntent =
    /(?:\bexplain\b|what .* does|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(
      groundedIntentPrompt,
    );
  const workflowIntentProjection = projectWorkflowIntent(
    groundedIntentPrompt,
    continuity,
  );
  const hasReflectiveExplainStateQuestion =
    workflowIntentProjection.hasReflectiveExplainStateQuestion;
  const hasReflectiveExplainContinuation =
    isReflectiveExplainContinuationPrompt(groundedIntentPrompt);
  const hasReflectiveExplainQuery =
    hasReflectiveExplainStateQuestion || hasReflectiveExplainContinuation;
  const detectedReflectiveStateQueryKind =
    workflowIntentProjection.detectedReflectiveStateQueryKind;
  const reflectiveStateQueryKind =
    workflowIntentProjection.reflectiveStateQueryKind;
  const hasReflectiveActionCue =
    workflowIntentProjection.hasReflectiveActionCue;
  const hasPriorLocalExplainEvidence =
    hasWorkflowLocalExplainEvidence(continuity);
  const hasRecoverableReadFragmentEvidence =
    hasWorkflowReadFragmentEvidence(continuity);
  const hasLocalExplainCue =
    hasExplainIntent &&
    (hasLocalSliceExplainCue(groundedIntentPrompt) ||
      (hasReflectiveExplainContinuation &&
        (hasPriorLocalExplainEvidence || hasRecoverableReadFragmentEvidence)));
  const hasGroundedReadLikeIntent =
    hasFileReadIntent || hasSummarizeIntent || hasExplainIntent;
  const hasGroundedConstraintCue =
    parseGroundedRepairConstraints(groundedIntentPrompt) !== undefined;
  const hasCreateIntent =
    /(?:create|new file|\u65b0\u589e|\u521b\u5efa|\u65b0\u5efa|\u5199\u4e00\u4e2a)/i.test(
      intentPrompt,
    );
  const mutationIntentPrompt = removeNegatedMutationInstructions(intentPrompt);
  const hasEditIntentRaw =
    /(?:\bedit\b|modify|update|fix|change|repair|replace|swap|\badd\b|\binsert\b|\bappend\b|continue fixing|continue repairing|\u4fee\u6539|\u4fee\u590d|\u6539\u4e00\u4e0b|\u6539\u6210|\u6539\u4e3a|\u66ff\u6362|\u66ff\u6362\u4e3a|\u7ee7\u7eed\u4fee)/i.test(
      mutationIntentPrompt,
    );
  const hasEditIntent =
    hasEditIntentRaw &&
    !hasContextSeedPrefix &&
    !hasExplicitBoundaryResetPrompt;
  const hasVerifyIntent =
    /(?:verify|test|build|lint|check|\u9a8c\u8bc1|\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(
      intentPrompt,
    );
  const hasCorrectionCue = isCorrectionFollowUpPrompt(prompt);
  const hasExecutionCorrectionCue = isExecutionCorrectionFollowUpPrompt(prompt);
  const hasAnswerRepairCue = isAnswerRepairFollowUpPrompt(prompt);
  const isAmbiguousRepairFollowUp = isAmbiguousGroundedRepairFollowUp(prompt);
  const hasDiagnosisIntent =
    /(?:why|how|where|which file|implemented|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5728\u54ea|\u54ea\u4e2a\u6587\u4ef6|\u5b9e\u73b0)/i.test(
      groundedIntentPrompt,
    );
  const hasWeakRepairFollowUp = isWeakRepairFollowUpPrompt(prompt);
  const avoidPreviousDirection = isAvoidPreviousDirectionPrompt(prompt);
  const hasCrossFileCue = isCrossFileRepairFollowUpPrompt(prompt);
  const hasVerifyContinuationCue = isVerifyContinuationFollowUpPrompt(prompt);
  const verifyCommand = hasExternalVerifyOptOut(prompt)
    ? undefined
    : detectVerifyCommand(normalized);
  const preferTestOverBuild = prefersTestOverBuildInFollowUp(prompt);
  const effectiveVerifyCommand =
    preferTestOverBuild && hasVerifyIntent
      ? "npm test -- --help"
      : verifyCommand;
  const effectiveReplaceDirectiveFromPrompt = extractReplaceDirective(prompt);
  const hasExecutionIntent = hasExplicitExecutionIntent(prompt, normalized);
  const unsupportedCommand = detectUnsupportedCommandForPlanning(normalized);

  return {
    normalized,
    intentPrompt,
    groundedIntentPrompt,
    hasContextSeedPrefix,
    hasExplicitBoundaryResetPrompt,
    hasFileReadIntent,
    hasTargetedFileReadIntent,
    hasRepositoryInspectIntent,
    hasSummarizeIntent,
    hasExplainIntent,
    hasReflectiveExplainStateQuestion,
    hasReflectiveExplainContinuation,
    hasReflectiveExplainQuery,
    detectedReflectiveStateQueryKind,
    reflectiveStateQueryKind,
    hasReflectiveActionCue,
    hasPriorLocalExplainEvidence,
    hasRecoverableReadFragmentEvidence,
    hasLocalExplainCue,
    hasGroundedReadLikeIntent,
    hasGroundedConstraintCue,
    hasCreateIntent,
    hasEditIntentRaw,
    hasEditIntent,
    hasVerifyIntent,
    hasCorrectionCue,
    hasExecutionCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasDiagnosisIntent,
    hasWeakRepairFollowUp,
    avoidPreviousDirection,
    hasCrossFileCue,
    hasVerifyContinuationCue,
    verifyCommand,
    preferTestOverBuild,
    effectiveVerifyCommand,
    effectiveReplaceDirectiveFromPrompt,
    hasExecutionIntent,
    unsupportedCommand,
  };
}

export function isCorrectionFollowUpPrompt(prompt: string): boolean {
  return /(?:\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d|\u6211\u8981\u7684\u662f|\u4e0d\u662f.*\u800c\u662f|\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u91cd\u7b54\u4e0a\u4e00\u9898|\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6|\u4e0d\u662f\u65b9\u6cd5|correction:|directly summarize|not this meaning|redo previous answer|revise last answer|not that edit)/i.test(
    prompt,
  );
}

export function isAnswerRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:so where is your summary|where(?:'s| is)\s+(?:the|your)\s+(?:summary|explanation)|go on with the summary|continue the summary|continue the explanation|i asked for .*summary|i asked for .*explain|not file info, summarize content|give the actual summary|so your summary\?|so your explanation\?|所以你的总结呢|我要的是内容总结|不是文件信息|直接给摘要|继续解释刚才那个文件|继续总结刚才那个文件)/i.test(
    prompt,
  );
}

export function isAmbiguousGroundedRepairFollowUp(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length > 24) {
    return false;
  }
  return /^(then\??|go on|continue|and then\??|\u7ee7\u7eed|\u7136\u540e\u5462|\u63a5\u7740\u5462|\u518d\u7ee7\u7eed)$/.test(
    normalized,
  );
}

export function isExecutionCorrectionFollowUpPrompt(prompt: string): boolean {
  return /(?:\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u7ee7\u7eed\u4fee\u521a\u624d\u90a3\u4e2a\u5931\u8d25|\u6309\u521a\u624d\u90a3\u4e2a\u7ed3\u679c\u7ee7\u7eed|not that edit|keep signature|don't overwrite|continue fixing the previous failure|continue that failed fix)/i.test(
    prompt,
  );
}

export {
  isPostEditReadOnlyVerifyFollowUp,
  isVerifyContinuationFollowUpPrompt,
  prefersTestOverBuildInFollowUp,
} from "../verification/verifyContinuationPlanning.js";

export function isWeakSeedTargetCarryoverPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 80) {
    return false;
  }
  return /^(?:check it|verify again|what next|what's next|fix it|continue|go on|proceed|do the next step)$/i.test(
    normalized,
  );
}

export function isWeakRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:use the failure above|same file.*not that fix|not the right fix|wrong direction|fix the real issue|continue repairing it|continue fixing it|不要再走刚才那个错误方向|同一个文件.*不是那个修法|基于上一次失败继续修复)/i.test(
    prompt,
  );
}

export function isUltraWeakContinuationFollowUpPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 40) {
    return false;
  }
  if (
    /^(?:thanks|thank you|thx|ok|okay|got it|sounds good|great|nice|understood|收到|好的|明白了)$/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /^(?:keep going|go on|do it|finish it|keep at it|go ahead|carry on|继续|接着|继续吧|继续做|接着做|做吧|继续一下)$/i.test(
    normalized,
  );
}

export function isTemporalSuccessorCuePrompt(prompt: string): boolean {
  const firstMeaningfulLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const normalized = firstMeaningfulLine
    .trim()
    .toLowerCase()
    .replace(/[!?。！？]+$/g, "")
    .trim();
  if (!normalized || normalized.length > 24) {
    return false;
  }
  const words = normalized.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 4) {
    return false;
  }
  const allowedWords = new Set([
    "next",
    "then",
    "what",
    "what's",
    "whats",
    "is",
    "after",
    "that",
    "and",
  ]);
  for (const word of words) {
    if (!allowedWords.has(word)) {
      return false;
    }
  }
  const hasNext = words.includes("next");
  const hasThen = words.includes("then");
  const hasAfterThat = words.includes("after") && words.includes("that");
  return hasNext || hasThen || hasAfterThat;
}

export function isAvoidPreviousDirectionPrompt(prompt: string): boolean {
  return /(?:same file.*not that (?:fix|change)|同一个文件.*不是那个修法|同文件.*不是那个改法)/i.test(
    prompt,
  );
}

export function isCrossFileRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:complete the rest|rest of files|other files|source\s*\+\s*test|source\s*\+\s*helper|source\s*\+\s*config|补齐其余文件|连同测试一起修|同步辅助文件|同步配置)/i.test(
    prompt,
  );
}

export function isReflectiveExplainContinuationPrompt(
  prompt: string,
): boolean {
  return /(?:continue explaining that part|继续解释这部分)/i.test(prompt);
}
