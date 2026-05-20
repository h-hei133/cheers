import { rebindPathLikeToWorkspace } from "../core/paths/legacyRootRebase.js";
import {
  projectContinuationSafeTargetSummary,
  type ContinuationSafeTargetSummary,
} from "./workspaceTargetProjection.js";

export type ContinuationRebaseStatus =
  | "rebased"
  | "unchanged"
  | "missing"
  | "ambiguous";

export interface ContinuationRebaseResolution {
  readonly status: ContinuationRebaseStatus;
  readonly targetPath?: string;
  readonly reason: string;
  readonly candidates: readonly string[];
  readonly targetSummary: ContinuationSafeTargetSummary;
}

export function resolveContinuationRebase(input: {
  readonly priorPath?: string;
  readonly workspaceRoot: string;
  readonly candidates?: readonly string[];
}): ContinuationRebaseResolution {
  const priorPath = normalizePathLike(input.priorPath ?? "");
  if (!priorPath) {
    return {
      status: "missing",
      reason: "no prior target path was available",
      candidates: [],
      targetSummary: projectContinuationSafeTargetSummary({
        status: "missing",
      }),
    };
  }

  const rebound = rebindPathLikeToWorkspace(priorPath, input.workspaceRoot);
  if (rebound) {
    return {
      status: rebound === priorPath ? "unchanged" : "rebased",
      targetPath: rebound,
      reason:
        rebound === priorPath
          ? "prior target is already in the current workspace"
          : "prior target was rebased to current workspace path",
      candidates: [rebound],
      targetSummary: projectContinuationSafeTargetSummary({
        status: rebound === priorPath ? "available" : "relocated",
        targetPath: rebound,
        relocatedFrom: rebound === priorPath ? undefined : priorPath,
      }),
    };
  }

  const candidates = uniqueNormalized(input.candidates ?? []);
  if (candidates.length === 1) {
    return {
      status: "rebased",
      targetPath: candidates[0],
      reason: "single deterministic candidate selected",
      candidates,
      targetSummary: projectContinuationSafeTargetSummary({
        status: "relocated",
        targetPath: candidates[0],
        relocatedFrom: priorPath,
        candidates,
      }),
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple deterministic candidates require explicit selection",
      candidates,
      targetSummary: projectContinuationSafeTargetSummary({
        status: "ambiguous",
        relocatedFrom: priorPath,
        candidates,
      }),
    };
  }
  return {
    status: "missing",
    reason: "prior target is missing and no deterministic candidate was found",
    candidates: [],
    targetSummary: projectContinuationSafeTargetSummary({
      status: "missing",
      relocatedFrom: priorPath,
    }),
  };
}

function uniqueNormalized(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map(normalizePathLike).filter((value) => value.length > 0)),
  );
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
