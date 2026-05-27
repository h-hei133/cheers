import {
  extractFileConstraintAssertions,
  type FileConstraintAssertions,
} from "../orchestration/fileConstraintAssertions.js";

export function selectMutationTargetFromPrompt<
  TTarget extends { readonly cleaned: string },
>(
  prompt: string,
  targets: readonly TTarget[],
): TTarget | undefined {
  const selectionPlan = planMutationTargetSelection(prompt, targets);
  return rankMutationTargetCandidates(selectionPlan);
}

export interface MutationTargetSelectionPlan<
  TTarget extends { readonly cleaned: string },
> {
  lowerPrompt: string;
  candidateTargets: readonly TTarget[];
  targetNames: readonly string[];
  fileConstraints: FileConstraintAssertions;
}

export function planMutationTargetSelection<
  TTarget extends { readonly cleaned: string },
>(
  prompt: string,
  targets: readonly TTarget[],
): MutationTargetSelectionPlan<TTarget> {
  const fileConstraints = extractFileConstraintAssertions(prompt);
  const protectedPaths = new Set(
    fileConstraints.protectedMutationPaths.map((item) =>
      normalizePathLike(item),
    ),
  );
  const mutationTargets = targets.filter(
    (target) => !protectedPaths.has(normalizePathLike(target.cleaned)),
  );
  const candidateTargets =
    mutationTargets.length > 0 ? mutationTargets : targets;
  return {
    lowerPrompt: prompt.toLowerCase(),
    candidateTargets,
    targetNames: candidateTargets.map((target) => target.cleaned.toLowerCase()),
    fileConstraints,
  };
}

export function rankMutationTargetCandidates<
  TTarget extends { readonly cleaned: string },
>(selectionPlan: MutationTargetSelectionPlan<TTarget>): TTarget | undefined {
  const { candidateTargets, lowerPrompt, targetNames } = selectionPlan;
  if (candidateTargets.length <= 1) {
    return candidateTargets[0];
  }
  let best:
    | {
        target: TTarget;
        score: number;
      }
    | undefined;
  for (const target of candidateTargets) {
    const targetIndex = lowerPrompt.indexOf(target.cleaned.toLowerCase());
    if (targetIndex < 0) {
      continue;
    }
    const score = scoreMutationTargetOccurrence(
      lowerPrompt,
      targetIndex,
      target.cleaned.toLowerCase(),
      targetNames,
    );
    if (!best || score > best.score) {
      best = { target, score };
    }
  }
  return best?.target;
}

function scoreMutationTargetOccurrence(
  lowerPrompt: string,
  targetIndex: number,
  targetName: string,
  targetNames: readonly string[],
): number {
  const segmentStart = findPromptSegmentStart(lowerPrompt, targetIndex);
  const prefix = lowerPrompt.slice(segmentStart, targetIndex);
  const segmentWithTarget = lowerPrompt.slice(
    segmentStart,
    Math.min(lowerPrompt.length, targetIndex + targetName.length + 40),
  );
  const directMutationTarget = new RegExp(
    `\\b(?:create|write|append|update|edit|modify|replace)\\b\\s+(?:to\\s+|in\\s+|at\\s+|the\\s+file\\s+|file\\s+)?${escapeRegExp(targetName)}\\b`,
  ).test(segmentWithTarget);
  const mutationMatches = Array.from(
    prefix.matchAll(/\b(create|write|append|update|edit|modify|replace)\b/g),
  );
  const lastMutation = mutationMatches.at(-1);
  const verifyCue = /\b(?:verify|confirm|ensure|check)\b/.test(prefix);
  const readCue = /\b(?:read|inspect|open|show|summari[sz]e)\b/.test(prefix);
  let score = directMutationTarget ? 5 : 0;
  if (!directMutationTarget && lastMutation) {
    const afterMutation = prefix.slice(
      (lastMutation.index ?? 0) + lastMutation[0].length,
    );
    const mentionsOtherTarget = targetNames.some(
      (name) => name !== targetName && afterMutation.includes(name),
    );
    score += mentionsOtherTarget ? -1 : 3;
  }
  if (verifyCue) {
    score -= 3;
  }
  if (readCue) {
    score -= 2;
  }
  // Keep ties stable and prefer the earliest local mutation target.
  return score - targetIndex / 10000;
}

function findPromptSegmentStart(
  lowerPrompt: string,
  targetIndex: number,
): number {
  const boundaries = [
    "\n",
    ".",
    ";",
    "!",
    "?",
    "\u3002",
    "\uff1b",
    "\uff01",
    "\uff1f",
  ];
  let start = 0;
  for (const boundary of boundaries) {
    const boundaryIndex = lowerPrompt.lastIndexOf(boundary, targetIndex - 1);
    if (boundaryIndex >= 0) {
      start = Math.max(start, boundaryIndex + boundary.length);
    }
  }
  return start;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
