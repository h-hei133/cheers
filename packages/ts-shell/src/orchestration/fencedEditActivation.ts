import {
  parseExactFencedReplacementMapping,
  type FencedEditMapping,
} from "./fencedEditPlanner.js";
import {
  buildStoppedFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
} from "./fencedEditRoute.js";

export type FencedEditActivation =
  | {
      readonly status: "not-selected";
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "selected";
      readonly targetPath: string;
      readonly mapping: FencedEditMapping;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "stopped";
      readonly route: Extract<FencedEditReplacementRoute, { status: "blocked" }>;
      readonly evidence: readonly string[];
    };

export function selectFencedEditReplacementActivation(input: {
  readonly prompt: string;
  readonly targetPath?: string;
  readonly replaceDirective?: { readonly from: string; readonly to: string };
  readonly hasMultipleTargets?: boolean;
}): FencedEditActivation {
  const fencedShape = getFencedPromptShape(input.prompt);
  if (!looksLikeFencedReplacementPrompt(input.prompt, fencedShape)) {
    return {
      status: "not-selected",
      evidence: ["fenced-edit-activation:not-selected"],
    };
  }

  const unsupported = classifyUnsupportedActivation(input.prompt);
  if (unsupported) {
    const route = buildStoppedFencedEditReplacementRoute({
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      blocker: unsupported.blocker,
      reason: unsupported.reason,
      nextAction: unsupported.nextAction,
      evidence: [
        "fenced-edit-activation:selected",
        `fenced-edit-activation:blocker:${unsupported.blocker}`,
        "fenced-edit-activation:raw-content-excluded",
      ],
    });
    return {
      status: "stopped",
      route,
      evidence: route.evidence,
    };
  }

  if (
    fencedShape.fenceCount < 2 &&
    !input.replaceDirective &&
    !fencedShape.mentionsFencedRegion
  ) {
    return {
      status: "not-selected",
      evidence: ["fenced-edit-activation:not-selected:single-fence-rewrite"],
    };
  }

  if (input.hasMultipleTargets) {
    const route = buildStoppedFencedEditReplacementRoute({
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      blocker: "ambiguous-target",
      reason: "Exact fenced replacement accepts one explicit target file.",
      nextAction: "Retry with exactly one target file and one exact old/new fenced mapping.",
      evidence: [
        "fenced-edit-activation:selected",
        "fenced-edit-activation:blocker:ambiguous-target",
        "fenced-edit-activation:raw-content-excluded",
      ],
    });
    return {
      status: "stopped",
      route,
      evidence: route.evidence,
    };
  }

  const mapping = parseExactFencedReplacementMapping({
    prompt: input.prompt,
    ...(input.replaceDirective
      ? { replaceDirective: input.replaceDirective }
      : {}),
  });
  if (mapping.ok === false) {
    const route = buildStoppedFencedEditReplacementRoute({
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      blocker: mapping.blocker,
      reason: mapping.reason,
      nextAction: mapping.nextAction,
      evidence: [
        "fenced-edit-activation:selected",
        ...mapping.evidence,
        "fenced-edit-activation:raw-content-excluded",
      ],
    });
    return {
      status: "stopped",
      route,
      evidence: route.evidence,
    };
  }

  if (!input.targetPath) {
    const route = buildStoppedFencedEditReplacementRoute({
      blocker: "missing-target",
      reason: "Exact fenced replacement requires one explicit target file.",
      nextAction:
        "Retry with one explicit in-workspace target file and an exact old/new fenced mapping.",
      evidence: [
        "fenced-edit-activation:selected",
        "fenced-edit-activation:blocker:missing-target",
        ...mapping.evidence,
        "fenced-edit-activation:raw-content-excluded",
      ],
    });
    return {
      status: "stopped",
      route,
      evidence: route.evidence,
    };
  }

  return {
    status: "selected",
    targetPath: input.targetPath,
    mapping: mapping.mapping,
    evidence: [
      "fenced-edit-activation:selected",
      "fenced-edit-activation:exact-mapping",
      ...mapping.evidence,
      "fenced-edit-activation:raw-content-excluded",
    ],
  };
}

function getFencedPromptShape(prompt: string): {
  readonly fenceCount: number;
  readonly mentionsFencedRegion: boolean;
} {
  return {
    fenceCount: Array.from(prompt.matchAll(/```[\s\S]*?```/g)).length,
    mentionsFencedRegion:
      /\bfenced?\s+(?:block|blocks|region|regions|replacement|edit)\b|\bcode\s+block\b/i.test(
        prompt,
      ),
  };
}

function looksLikeFencedReplacementPrompt(
  prompt: string,
  shape: ReturnType<typeof getFencedPromptShape>,
): boolean {
  const hasEditVerb = /\b(?:edit|replace|update|change|swap)\b/i.test(prompt);
  const hasUnsupportedCue =
    /\b(?:find|discover|search|locate|similar|fuzzy|closest|nearest|all|every|each|matching|matches|broad|refactor|generate|generated|rewrite|implement|rollback|undo|snapshot|restore)\b/i.test(
      prompt,
    );
  return (
    (hasEditVerb || hasUnsupportedCue) &&
    (shape.fenceCount > 0 || shape.mentionsFencedRegion)
  );
}

function classifyUnsupportedActivation(prompt: string):
  | {
      readonly blocker:
        | "unsupported-discovery"
        | "unsupported-fuzzy"
        | "unsupported-broad"
        | "unsupported-generated"
        | "unsupported-rollback";
      readonly reason: string;
      readonly nextAction: string;
    }
  | undefined {
  if (/\b(?:similar|approximately|roughly|fuzzy|closest|nearest)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-fuzzy",
      reason: "Fuzzy fenced replacement is outside the exact replacement lane.",
      nextAction:
        "Provide exact old and new fenced blocks for one explicit target file.",
    };
  }
  if (/\b(?:find|discover|search|locate)\b[\s\S]{0,80}\b(?:file|target|right\s+place)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-discovery",
      reason: "Discovery-based fenced replacement is outside the activated lane.",
      nextAction:
        "Provide one explicit in-workspace target file and the exact old/new fenced blocks.",
    };
  }
  if (/\b(?:all|every|each|matching|matches|broad|refactor)\b[\s\S]{0,80}\b(?:fenced|block|blocks|region|regions|match|matches)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-broad",
      reason: "Broad or multi-region fenced replacement is outside the exact replacement lane.",
      nextAction:
        "Retry with one exact old fenced block that matches exactly one region.",
    };
  }
  if (/\b(?:generate|generated|rewrite|implement)\b[\s\S]{0,80}\b(?:fenced|block|region|content|implementation)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-generated",
      reason: "Generated-content fenced replacement is outside the exact mapping lane.",
      nextAction:
        "Provide exact replacement text instead of asking the runtime to generate it.",
    };
  }
  if (/\b(?:rollback|roll\s+back|undo|snapshot|restore)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-rollback",
      reason: "Rollback or snapshot behavior is outside the fenced replacement lane.",
      nextAction:
        "Use a dedicated restore route, or provide a fresh exact old/new fenced mapping.",
    };
  }
  return undefined;
}
