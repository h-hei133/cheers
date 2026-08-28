import path from "node:path";
import type {
  MultiTargetClassification,
  MultiTargetConflict,
  MultiTargetConflictKind,
  MultiTargetMutationInput,
  MultiTargetMutationTargetInput,
} from "./types.js";

export function detectConflicts(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly classifications: readonly MultiTargetClassification[];
  readonly notProvenClaims?: readonly string[];
}): readonly MultiTargetConflict[] {
  const conflicts: MultiTargetConflict[] = [];
  const byPath = new Map<string, MultiTargetMutationTargetInput[]>();

  for (const target of input.input.targets) {
    const normalized = path.normalize(target.relativePath).toLowerCase();
    const existing = byPath.get(normalized) ?? [];
    existing.push(target);
    byPath.set(normalized, existing);
  }

  // Detect same file overlap and hunk conflicts
  for (const [relPath, targets] of byPath.entries()) {
    if (targets.length > 1) {
      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const left = targets[i]!;
          const right = targets[j]!;
          const overlap =
            left.hunk && right.hunk
              ? rangesOverlap(left.hunk, right.hunk)
              : true;
          const kind: MultiTargetConflictKind = overlap
            ? "overlapping_hunk"
            : "same_file_overlap";
          conflicts.push({
            conflictId: `${input.laneId}:conflict:${kind}:${left.targetId}+${right.targetId}`,
            leftTargetId: left.targetId,
            rightTargetId: right.targetId,
            kind,
            reason: `Multiple mutations targeting ${relPath}${overlap ? " with overlapping line ranges" : ""}`,
            relativePath: relPath,
          });
        }
      }
    }
  }

  // Detect dependency ordering conflicts
  const targetMap = new Map(
    input.input.targets.map((t) => [t.targetId, t]),
  );
  for (const target of input.input.targets) {
    for (const depId of target.dependsOnTargetIds ?? []) {
      if (!targetMap.has(depId)) {
        conflicts.push({
          conflictId: `${input.laneId}:conflict:dependency_ordering:${target.targetId}+${depId}`,
          leftTargetId: target.targetId,
          rightTargetId: depId,
          kind: "dependency_ordering",
          reason: `Target ${target.targetId} depends on missing target ${depId}`,
        });
      }
    }
  }

  return conflicts;
}

export function rangesOverlap(
  left: { readonly startLine: number; readonly endLine: number },
  right: { readonly startLine: number; readonly endLine: number },
): boolean {
  return !(left.endLine < right.startLine || right.endLine < left.startLine);
}
