import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";
import type { ReflectiveStateQueryKind } from "./workflowTaskPlanner.js";

export interface WorkflowIntentProjection {
  readonly hasReflectiveExplainStateQuestion: boolean;
  readonly detectedReflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly hasReflectiveActionCue: boolean;
}

export function projectWorkflowIntent(
  prompt: string,
  continuity: ContinuityStateLike,
): WorkflowIntentProjection {
  const hasReflectiveExplainStateQuestion =
    isReflectiveExplainStateQuestion(prompt);
  const detectedReflectiveStateQueryKind =
    detectReflectiveStateQueryKind(prompt);
  const reflectiveStateQueryKind =
    detectedReflectiveStateQueryKind ??
    (hasStructuredApprovalMemoryInContinuity(continuity) &&
    hasPermissionExplanationIntent(prompt)
      ? "approval-memory"
      : undefined);
  return {
    hasReflectiveExplainStateQuestion,
    detectedReflectiveStateQueryKind,
    reflectiveStateQueryKind,
    hasReflectiveActionCue: hasReflectiveStateQueryActionCue(prompt),
  };
}

function isReflectiveExplainStateQuestion(prompt: string): boolean {
  return /(?:what part did you just explain|which part did you just explain|刚才解释的是哪一段|你刚才解释的是哪个片段)/i.test(
    prompt,
  );
}

function isReflectiveStopReasonQuery(prompt: string): boolean {
  return /(?:why did it stop|why did we stop|what failed|where did we stop|刚才为什么停了|为什么停了|刚才失败的是哪一步|上一步失败在哪|刚才卡在哪)/i.test(
    prompt,
  );
}

function isReflectiveReadPositionQuery(prompt: string): boolean {
  return /(?:where did we stop reading|where did i stop reading|where are we in the read|刚才读到哪里了|读到哪了|读到哪里了)/i.test(
    prompt,
  );
}

function isReflectiveNextStepQuery(prompt: string): boolean {
  return /(?:what should we do next|what should i do next|what is the next step|现在应该继续什么|下一步做什么|接下来该做什么)/i.test(
    prompt,
  );
}

function isReflectiveApprovalMemoryQuery(prompt: string): boolean {
  return /(?:what did i just approve|what did i approve|was that allow-once or allow-always|was that cached or one-shot|why is it asking again|did that get persisted|was that persisted|刚才我批准了什么|刚才那个是一次性还是永久授权|为什么这次还要再问审批|刚才那个授权有没有落盘|刚才那个授权是缓存还是一次性)/i.test(
    prompt,
  );
}

function isReflectiveTaskContinuityQuery(prompt: string): boolean {
  return /(?:after\s+resume|resume\s+check|session-id\s+resume\s+check|explicit\s+session-id\s+resume(?:\s+check)?|same\s+task|exact\s+task|keep\s+the\s+exact\s+task|report\s+in\s+3\s+lines?\s+only)/i.test(
    prompt,
  );
}

function hasReflectiveStateQueryActionCue(prompt: string): boolean {
  return /(?:\bdo that\b|\bcontinue with that\b|\bthen continue\b|\bcontinue fixing\b|\bcontinue reading(?:\s+next\s+\d+\s+lines?)\b|\bcontinue explaining(?:\s+that\s+part)?\b|那就按这个继续|按这个继续|那继续|继续修|继续读取|继续解释这部分)/i.test(
    prompt,
  );
}

function detectReflectiveStateQueryKind(
  prompt: string,
): ReflectiveStateQueryKind | undefined {
  if (isReflectiveExplainStateQuestion(prompt)) {
    return "explain-scope";
  }
  if (isReflectiveReadPositionQuery(prompt)) {
    return "read-position";
  }
  if (isReflectiveStopReasonQuery(prompt)) {
    return "stop-reason";
  }
  if (isReflectiveNextStepQuery(prompt)) {
    return "next-step";
  }
  if (isReflectiveApprovalMemoryQuery(prompt)) {
    return "approval-memory";
  }
  if (isReflectiveTaskContinuityQuery(prompt)) {
    return "task-continuity";
  }
  return undefined;
}

function hasStructuredApprovalMemoryInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  return Boolean(
    continuity.lastApprovalDecision ||
      continuity.lastApprovalDecisionSource ||
      continuity.lastApprovalCacheEffect ||
      continuity.lastApprovalProjectRoot ||
      continuity.lastApprovalCacheKey ||
      continuity.lastApprovalScope ||
      continuity.lastApprovalLineage ||
      continuity.lastApprovalStopReason ||
      continuity.lastApprovalRecordedAt,
  );
}

function hasPermissionExplanationIntent(prompt: string): boolean {
  const source = stripPathTokensForIntent(prompt);
  const text = source.length > 0 ? source : prompt;
  const lowered = text.toLowerCase();
  const hasPermissionLexicon =
    /(?:approval|approve|approved|grant|granted|authorize|authorized|permission|allow-once|allow-always|one-shot|persist(?:ed|ence)?|cached?|remember(?:ed)?)/i.test(
      lowered,
    ) ||
    /(?:授权|审批|批准|一次性|永久授权|落盘|缓存|生效|为什么这次又要问)/u.test(
      text,
    );
  if (!hasPermissionLexicon) {
    return false;
  }
  return /(?:\?|why|what|did|was|is it asking again|有没有|是不是|是否|为什么|刚才)/i.test(
    lowered,
  );
}

function stripPathTokensForIntent(prompt: string): string {
  return prompt
    .replace(
      /(?:^|[\s"'“”`(])(?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)(?:$|[\s"'“”`),.:;!?])/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
