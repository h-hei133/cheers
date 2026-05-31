import { hasPathLikeReference } from "../../planning/promptTargetProjection.js";
import { deriveWorkflowContinuationTarget } from "../../orchestration/continuationModule.js";
import type { ContinuityStateLike } from "../../orchestration/runtimeHandoffProjection.js";
import type {
  SingleFileEditFailureReason,
  SingleFileEditRepairPayloadKind,
} from "../../orchestration/workflowTaskPlanner.js";
import {
  isUsableContinuationTargetPath,
  rebindContinuationTargetToWorkspace,
} from "../../session/continuation/target.js";

export interface SingleFileEditFailureRepairContext {
  readonly failureReason: SingleFileEditFailureReason;
  readonly targetPath?: string;
}

export interface SingleFileEditFailureRepairContextAbandonment {
  readonly reason: "multiple-failed-targets";
  readonly failureReason: SingleFileEditFailureReason;
  readonly failedTargetCandidates: readonly string[];
}

export function resolveSingleFileEditFailureRepairContext(
  continuity: ContinuityStateLike,
  workspaceRoot: string,
): SingleFileEditFailureRepairContext | undefined {
  if (continuity.lastTaskKind !== "edit-file") {
    return undefined;
  }

  const failureReason = extractSingleFileEditFailureReason(continuity);
  if (!failureReason) {
    return undefined;
  }

  const targetCandidates = new Set<string>();
  const addCandidate = (rawCandidate: string | undefined): void => {
    const candidate = normalizePathLike(rawCandidate ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      return;
    }
    const rebound = rebindContinuationTargetToWorkspace(
      candidate,
      workspaceRoot,
    );
    if (rebound) {
      targetCandidates.add(rebound);
    }
  };

  addCandidate(
    deriveWorkflowContinuationTarget({
      continuity,
      workspaceRoot,
    }),
  );
  for (const entry of continuity.recentFailedFiles ?? []) {
    addCandidate(entry.path);
  }
  for (const entry of continuity.recentTargetFiles ?? []) {
    addCandidate(entry);
  }

  if (failureReason === "edit-target-missing") {
    return {
      failureReason,
      ...(targetCandidates.size === 1
        ? { targetPath: [...targetCandidates][0] }
        : {}),
    };
  }

  if (targetCandidates.size !== 1) {
    return undefined;
  }

  return {
    failureReason,
    targetPath: [...targetCandidates][0],
  };
}

export function resolveSingleFileEditFailureRepairContextAbandonment(
  continuity: ContinuityStateLike,
  workspaceRoot: string,
): SingleFileEditFailureRepairContextAbandonment | undefined {
  if (continuity.lastTaskKind !== "edit-file") {
    return undefined;
  }

  const failureReason = extractSingleFileEditFailureReason(continuity);
  if (!failureReason) {
    return undefined;
  }

  const failedTargetCandidates = new Set<string>();
  for (const entry of continuity.recentFailedFiles ?? []) {
    const candidate = normalizePathLike(entry.path ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      continue;
    }
    const rebound = rebindContinuationTargetToWorkspace(
      candidate,
      workspaceRoot,
    );
    if (rebound) {
      failedTargetCandidates.add(rebound);
    }
  }

  if (failedTargetCandidates.size <= 1) {
    return undefined;
  }

  return {
    reason: "multiple-failed-targets",
    failureReason,
    failedTargetCandidates: [...failedTargetCandidates],
  };
}

export function extractSingleFileEditFailureReason(
  continuity: ContinuityStateLike,
): SingleFileEditFailureReason | undefined {
  const evidence = [
    continuity.lastFailure ?? "",
    ...(continuity.recentFailedFiles ?? []).flatMap((entry) => [
      entry.path,
      entry.reason,
    ]),
    ...(continuity.lastContinuationEvidence ?? []),
    ...(continuity.unresolvedItems ?? []),
  ].join("\n");
  const match = evidence.match(
    /\b(edit-target-missing|edit-transform-unclear|patch-from-not-found|patch-ambiguous|patch-target-missing)\b/i,
  );
  return match?.[1]?.toLowerCase() as SingleFileEditFailureReason | undefined;
}

export function resolveSingleFileEditRepairPayloadKind(input: {
  readonly failureReason: SingleFileEditFailureReason;
  readonly prompt: string;
  readonly hasEditIntent: boolean;
  readonly replaceDirective?: { readonly from: string; readonly to: string };
  readonly fencedContent?: string;
}): SingleFileEditRepairPayloadKind | undefined {
  if (
    input.failureReason === "edit-target-missing" &&
    hasPathLikeReference(input.prompt) &&
    (input.hasEditIntent || input.replaceDirective || input.fencedContent)
  ) {
    return "target-path-with-transform";
  }
  if (input.replaceDirective) {
    return "replace-directive";
  }
  if (input.fencedContent) {
    return "fenced-content";
  }
  return undefined;
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
