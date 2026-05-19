import { rebindPathLikeToWorkspace } from "../core/paths/legacyRootRebase.js";

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
    };
  }

  const candidates = uniqueNormalized(input.candidates ?? []);
  if (candidates.length === 1) {
    return {
      status: "rebased",
      targetPath: candidates[0],
      reason: "single deterministic candidate selected",
      candidates,
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple deterministic candidates require explicit selection",
      candidates,
    };
  }
  return {
    status: "missing",
    reason: "prior target is missing and no deterministic candidate was found",
    candidates: [],
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
