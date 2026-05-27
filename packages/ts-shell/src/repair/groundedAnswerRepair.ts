import { stripPathTokensForIntent } from "../planning/promptTargetProjection.js";
import {
  extractContinuationReadLineCount,
  extractLastReadWindowFromContinuity,
  extractRequestedLineCount,
  hasImplicitReadContinuationCue,
  hasLocalSliceExplainCue,
} from "../context/readWindowContinuation.js";
import type {
  ContinuityStateLike,
  GroundedDeliverableMode,
} from "../orchestration/runtimeHandoffProjection.js";
import type {
  GroundedDeliverableConstraints,
  GroundedRepairInstruction,
  GroundedRepairStage,
} from "../orchestration/workflowTaskPlanner.js";

export function normalizeGroundedRepairInstruction(input: {
  prompt: string;
  continuity: ContinuityStateLike;
  explicitDeliverableMode?: GroundedDeliverableMode;
  effectiveDeliverableMode?: GroundedDeliverableMode;
  hasContinuationCue: boolean;
  hasCorrectionCue: boolean;
  hasAnswerRepairCue: boolean;
  isAmbiguousRepairFollowUp: boolean;
  hasGroundedReadLikeIntent: boolean;
  lastTaskWasReadLike: boolean;
}): GroundedRepairInstruction {
  const semanticPrompt = stripPathTokensForIntent(input.prompt);
  const source = semanticPrompt.length > 0 ? semanticPrompt : input.prompt;
  const lowered = source.toLowerCase();
  const currentMode =
    input.effectiveDeliverableMode ??
    input.continuity.lastGroundedDeliverableMode;
  const targetMode = input.explicitDeliverableMode ?? currentMode;
  const constraints = parseGroundedRepairConstraints(source);
  const continuationDefaultWindow = extractLastReadWindowFromContinuity(
    input.continuity,
  ).size;
  const requestedReadLinesForRepair =
    extractContinuationReadLineCount(source) ??
    extractRequestedLineCount(source) ??
    (hasImplicitReadContinuationCue(source)
      ? (continuationDefaultWindow ?? 2)
      : undefined);
  const stagedSteps = inferStagedGroundedRepairSteps({
    prompt: source,
    currentMode,
    explicitDeliverableMode: input.explicitDeliverableMode,
    requestedReadLines: requestedReadLinesForRepair,
  });
  const modeCueCount = countDeliverableModeCues(source);
  const hasSwitchCue =
    /(?:no\s+summary|not\s+summary|no\s+explain|not\s+explain|switch|instead|directly\s+explain|directly\s+summarize|涓嶇敤鎬荤粨|涓嶈鎬荤粨|鍒€荤粨|鎬荤粨鍏堜笉鐪媩鍏堜笉鎬荤粨|涓嶇敤瑙ｉ噴|涓嶈瑙ｉ噴|鍒В閲妡鐩存帴瑙ｉ噴|鐩存帴鎬荤粨)/i.test(
      lowered,
    ) && input.explicitDeliverableMode !== undefined;
  const conflictingModeCue = modeCueCount > 1 && !hasSwitchCue && !stagedSteps;
  if (stagedSteps && stagedSteps.length > 0) {
    const stagedResumeCursor = resolveStagedRepairResumeCursor({
      continuity: input.continuity,
      stagedStepCount: stagedSteps.length,
      hasContinuationIntent:
        input.hasContinuationCue ||
        input.hasCorrectionCue ||
        input.hasAnswerRepairCue ||
        input.isAmbiguousRepairFollowUp,
    });
    return {
      operation: hasSwitchCue ? "switch" : "repair",
      targetMode: stagedSteps[stagedSteps.length - 1]?.mode ?? targetMode,
      constraints,
      stagedSteps,
      ...(stagedResumeCursor > 1 ? { stagedResumeCursor } : {}),
      reason: "compound follow-up decomposed into staged grounded repair plan",
    };
  }
  if (conflictingModeCue && input.lastTaskWasReadLike) {
    return {
      operation: "clarify",
      targetMode,
      constraints,
      reason: "mixed-intent repair follow-up has conflicting deliverable cues",
      clarificationPrompt:
        "Your follow-up mixes multiple deliverables. Clarify one: continue summary, switch to explain, or continue read with a filter.",
    };
  }

  if (hasSwitchCue && input.explicitDeliverableMode) {
    return {
      operation: "switch",
      targetMode: input.explicitDeliverableMode,
      constraints,
      reason: "explicit deliverable switch in grounded follow-up",
    };
  }

  if (
    input.hasCorrectionCue ||
    input.hasAnswerRepairCue ||
    constraints !== undefined
  ) {
    return {
      operation: "repair",
      targetMode,
      constraints,
      reason: "grounded answer repair follow-up",
    };
  }

  if (
    input.isAmbiguousRepairFollowUp &&
    input.lastTaskWasReadLike &&
    targetMode
  ) {
    return {
      operation: "continue",
      targetMode,
      constraints,
      reason: "ambiguous follow-up resolved to active grounded deliverable",
    };
  }

  if (input.hasContinuationCue && input.lastTaskWasReadLike && targetMode) {
    return {
      operation: "continue",
      targetMode,
      constraints,
      reason: "continuation follow-up for grounded deliverable",
    };
  }

  return {
    operation: "continue",
    targetMode,
    constraints,
    reason: input.hasGroundedReadLikeIntent
      ? "grounded intent detected from prompt"
      : "no explicit grounded repair intent",
  };
}

function inferStagedGroundedRepairSteps(input: {
  prompt: string;
  currentMode?: GroundedDeliverableMode;
  explicitDeliverableMode?: GroundedDeliverableMode;
  requestedReadLines?: number;
}): readonly GroundedRepairStage[] | undefined {
  const segments = splitCompoundRepairPrompt(input.prompt);
  if (segments.length < 2) {
    return undefined;
  }
  const steps: GroundedRepairStage[] = [];
  let resolvedAnyRead = false;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const segmentMode =
      inferSegmentDeliverableMode(segment) ??
      (index === 0
        ? (input.explicitDeliverableMode ?? input.currentMode)
        : undefined);
    if (!segmentMode) {
      return undefined;
    }
    const segmentConstraints = parseGroundedRepairConstraints(segment);
    const summaryConclusionOnly =
      /(缁撹|conclusion)/i.test(segment) &&
      !/(渚濇嵁|evidence)/i.test(segment);
    const summaryEvidenceOnly =
      /(渚濇嵁|evidence)/i.test(segment) &&
      !/(缁撹|conclusion)/i.test(segment);
    const summaryEvidenceCount = extractEvidenceCount(segment);
    const appendRiskLine = /(鍏抽敭椋庨櫓|key risks?|risk)/i.test(segment);
    const readCount =
      extractRequestedLineCount(segment) ??
      extractContinuationReadLineCount(segment);
    const continueRead =
      /(?:continue|next|继续|接着|后\s*\d+\s*行|下一段)/i.test(segment) ||
      hasImplicitReadContinuationCue(segment);
    const localSliceExplain = hasLocalSliceExplainCue(segment);
    const step: GroundedRepairStage = {
      mode: segmentMode,
      label: buildStageLabel(segmentMode, segment),
      constraints: segmentConstraints,
      ...(segmentMode === "read"
        ? {
            readLineCount: readCount ?? input.requestedReadLines ?? 2,
            continueFromPreviousRead: resolvedAnyRead || continueRead,
          }
        : {}),
      ...(summaryConclusionOnly ? { summaryConclusionOnly: true } : {}),
      ...(summaryEvidenceOnly ? { summaryEvidenceOnly: true } : {}),
      ...(summaryEvidenceCount !== undefined ? { summaryEvidenceCount } : {}),
      ...(appendRiskLine ? { appendRiskLine: true } : {}),
      ...(segmentMode === "explain" && localSliceExplain
        ? { useLatestReadSnippet: true }
        : {}),
    };
    if (segmentMode === "read") {
      resolvedAnyRead = true;
    }
    steps.push(step);
  }
  return steps.length > 1 ? steps : undefined;
}

function resolveStagedRepairResumeCursor(input: {
  continuity: ContinuityStateLike;
  stagedStepCount: number;
  hasContinuationIntent: boolean;
}): number {
  if (!input.hasContinuationIntent || input.stagedStepCount <= 1) {
    return 1;
  }
  const continuity = input.continuity;
  const continuityTotal =
    continuity.lastStagedRepairStepCount ??
    extractStagedRepairStepTotalFromEvidence(
      continuity.lastContinuationEvidence,
    );
  if (
    continuityTotal !== undefined &&
    continuityTotal !== input.stagedStepCount
  ) {
    return 1;
  }

  const candidateCursor =
    continuity.lastStagedRepairNextStep ??
    extractStagedRepairNextStepFromEvidence(
      continuity.lastContinuationEvidence,
    ) ??
    (() => {
      const completed =
        continuity.lastStagedRepairCompletedStep ??
        extractStagedRepairCompletedStepFromEvidence(
          continuity.lastContinuationEvidence,
        );
      return completed !== undefined ? completed + 1 : undefined;
    })();
  if (candidateCursor === undefined) {
    return 1;
  }
  const parsed = Math.floor(candidateCursor);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  if (parsed > input.stagedStepCount) {
    return input.stagedStepCount;
  }
  return parsed;
}

function extractStagedRepairStepTotalFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(/^staged-repair-(?:step-total|steps):(\d+)$/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractStagedRepairCompletedStepFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(
      /^staged-repair-(?:completed-step|step-cursor):(\d+)$/i,
    );
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractStagedRepairNextStepFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(/^staged-repair-next-step:(\d+)$/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function splitCompoundRepairPrompt(prompt: string): string[] {
  return prompt
    .split(
      /(?:\bthen\b|\band then\b|,\s*then\b|,\s*and then\b|,\s*and\s+(?:explain|summari[sz]e|read)\b|，然后|，再|然后|再补|再给|再说明|再解释|再读|并解释|并说明|并补)/i,
    )
    .map((segment) =>
      segment.replace(/^(?:first|firstly|首先|先)\s*/i, "").trim(),
    )
    .filter((segment) => segment.length > 0);
}

function inferSegmentDeliverableMode(
  segment: string,
): GroundedDeliverableMode | undefined {
  const mode = detectGroundedDeliverableMode(segment);
  if (mode) {
    return mode;
  }
  if (/(结论|依据|summary|summari[sz]e)/i.test(segment)) {
    return "summary";
  }
  if (/(解释|explain|作用|输入输出|what .* does)/i.test(segment)) {
    return "explain";
  }
  if (
    /(read|读取|继续读\s*\d+\s*行|前\s*\d+\s*行|next\s+\d+\s+lines?)/i.test(
      segment,
    )
  ) {
    return "read";
  }
  return undefined;
}

function buildStageLabel(
  mode: GroundedDeliverableMode,
  segment: string,
): string {
  const compact = segment.replace(/\s+/g, " ").trim();
  const preview = compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
  return `${mode}: ${preview}`;
}

function extractEvidenceCount(segment: string): number | undefined {
  const arabic = segment.match(/(\d+)\s*(?:条)?\s*(?:依据|evidence)/i);
  if (arabic?.[1]) {
    const parsed = Number.parseInt(arabic[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const chinese = segment.match(
    /([一二三四五六七八九十两])\s*(?:条)?\s*(?:依据)/u,
  );
  if (chinese?.[1]) {
    const mapped = mapChineseDigit(chinese[1]);
    return mapped > 0 ? mapped : undefined;
  }
  return undefined;
}

function mapChineseDigit(token: string): number {
  const mapping: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return mapping[token] ?? 0;
}

export function parseGroundedRepairConstraints(
  prompt: string,
): GroundedDeliverableConstraints | undefined {
  const summaryConclusion =
    /(?:结论.*两条依据|两条依据.*结论|conclusion.*two.*evidence|two.*evidence.*conclusion)/i.test(
      prompt,
    );
  const summaryRisk = /(?:关键风险|key risks?|risk)/i.test(prompt);
  const noGeneric = /(?:不要再泛泛而谈|not generic|avoid generic)/i.test(
    prompt,
  );
  const explainIoOnly =
    /(?:别解释实现细节.*只说明.*作用.*输入输出|only.*purpose.*input.*output|no implementation details)/i.test(
      prompt,
    );
  const readFilterIntent = detectReadFilterIntent(prompt);
  const preserveHighlights =
    /(?:保留刚才识别出的重点|preserve .*highlights|keep .*key points)/i.test(
      prompt,
    );

  const constraints: GroundedDeliverableConstraints = {};
  if (summaryConclusion) {
    constraints.summaryStyle = "conclusion-with-evidence";
    constraints.summaryEvidenceCount = 2;
  }
  if (summaryRisk) {
    constraints.includeKeyRisks = true;
  }
  if (noGeneric) {
    constraints.avoidGenericLanguage = true;
  }
  if (explainIoOnly) {
    constraints.explainScope = "purpose-io-only";
  }
  if (readFilterIntent === "function-definitions") {
    constraints.readFilter = readFilterIntent;
  }
  if (preserveHighlights) {
    constraints.preserveRecognizedHighlights = true;
  }

  if (Object.keys(constraints).length === 0) {
    return undefined;
  }
  return constraints;
}

export function detectReadFilterIntent(
  prompt: string,
): "function-definitions" | undefined {
  const source = stripPathTokensForIntent(prompt);
  const text = source.length > 0 ? source : prompt;
  const lowered = text.toLowerCase();

  if (
    /(?:只(?:看|给)?(?:函数|方法)?定义(?:相关)?(?:的)?行?|只(?:看|给)?导出(?:定义)?)/u.test(
      text,
    )
  ) {
    return "function-definitions";
  }
  if (
    /(?:鍙粰鍑芥暟瀹氫箟|鍙湅鍑芥暟瀹氫箟鐩稿叧鐨勮|鍙湅瀵煎嚭瀹氫箟|鍙湅瀵煎嚭)/i.test(
      text,
    )
  ) {
    return "function-definitions";
  }

  const hasOnlyQualifier =
    /\b(?:only|just|show only|only show)\b/i.test(lowered) ||
    /\b(?:definitions?\s+only)\b/i.test(lowered);
  const hasFunctionDefinitionCue =
    /\bfunction(?:s)?\b/i.test(lowered) && /\bdefinitions?\b/i.test(lowered);
  const hasHyphenatedFunctionDefinitionCue =
    /\bfunction(?:-|\s)?definition(?:-|\s)?related\b/i.test(lowered);
  const hasExportDefinitionCue =
    /\bexport(?:ed)?\s+definitions?\b/i.test(lowered) ||
    /\bdefinitions?\s+of\s+exports?\b/i.test(lowered);
  if (
    (hasOnlyQualifier && hasFunctionDefinitionCue) ||
    hasHyphenatedFunctionDefinitionCue ||
    (hasOnlyQualifier && hasExportDefinitionCue)
  ) {
    return "function-definitions";
  }

  return undefined;
}

export function detectGroundedDeliverableMode(
  prompt: string,
): GroundedDeliverableMode | undefined {
  const semanticPrompt = stripPathTokensForIntent(prompt);
  const source = semanticPrompt.length > 0 ? semanticPrompt : prompt;
  const lowered = source.toLowerCase();
  const explicitSwitchToExplain =
    /(?:no\s+summary|not\s+summary|don't\s+summarize|skip\s+summary).*?(?:\bexplain\b|what .* does)/i.test(
      lowered,
    ) ||
    /(?:不用总结|不要总结|别总结|总结先不看|先不总结).*(?:解释|在做什么)/u.test(
      source,
    );
  const explicitSwitchToSummary =
    /(?:no\s+explain|don't\s+explain|skip\s+explain).*\b(summarize|summary)\b/i.test(
      lowered,
    ) || /(?:不用解释|不要解释|别解释).*(?:总结|摘要)/u.test(source);
  const explicitSwitchToRead =
    /(?:no\s+explain|no\s+summary|skip\s+(?:summary|explain)).*\b(read|show|print)\b/i.test(
      lowered,
    ) ||
    /(?:不用解释|不用总结|不要解释|不要总结).*(?:读取|读前?\s*\d+\s*行)/u.test(
      source,
    );
  if (explicitSwitchToExplain) {
    return "explain";
  }
  if (explicitSwitchToSummary) {
    return "summary";
  }
  if (explicitSwitchToRead) {
    return "read";
  }
  if (
    /(?:\u8bfb\u53d6|\u67e5\u770b|\u524d\s*\d+\s*\u884c|\u540e\s*\d+\s*\u884c)/u.test(
      source,
    ) ||
    /\b(read|show|print|first\s+\d+\s+lines?|next\s+\d+\s+lines?)\b/i.test(
      lowered,
    )
  ) {
    return "read";
  }
  if (
    /(?:\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/u.test(source) ||
    /\b(summarize|summary)\b/i.test(lowered)
  ) {
    return "summary";
  }
  if (
    /(?:\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/u.test(source) ||
    /\b(explain|what .* does)\b/i.test(lowered)
  ) {
    return "explain";
  }
  return undefined;
}

export function inferGroundedDeliverableModeFromContinuity(
  continuity: ContinuityStateLike,
): GroundedDeliverableMode | undefined {
  if (continuity.lastGroundedDeliverableMode) {
    return continuity.lastGroundedDeliverableMode;
  }
  for (const marker of continuity.lastContinuationEvidence ?? []) {
    const match = marker.match(/^deliverable-mode:(read|summary|explain)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase() as GroundedDeliverableMode;
    }
  }
  if (continuity.lastTaskKind === "repo-explain") {
    return "explain";
  }
  if (continuity.lastTaskKind === "read-file") {
    return "read";
  }
  return undefined;
}

function countDeliverableModeCues(prompt: string): number {
  const lowered = prompt.toLowerCase();
  const hasRead =
    /(?:\bread\b|first\s+\d+\s+lines?|next\s+\d+\s+lines?|\bprint\b|读取|读前|读后|继续读)/i.test(
      lowered,
    );
  const hasSummary = /(?:\bsummar(?:y|ize)\b|鎬荤粨|鎽樿|姒傝堪)/i.test(
    lowered,
  );
  const hasExplain = /(?:\bexplain\b|what .* does|解释|在做什么)/i.test(
    lowered,
  );
  return Number(hasRead) + Number(hasSummary) + Number(hasExplain);
}
