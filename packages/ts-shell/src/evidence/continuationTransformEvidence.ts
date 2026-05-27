export interface ContinuationTransformEvidence {
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

export function parseContinuationTransformEvidence(
  evidence: string,
): ContinuationTransformEvidence | undefined {
  const directMatch = evidence.match(/^transform:(.+):(.+)=>(.+)$/i);
  if (directMatch?.[1] && directMatch?.[2] && directMatch?.[3]) {
    return {
      path: directMatch[1].trim(),
      from: directMatch[2].trim(),
      to: directMatch[3].trim(),
    };
  }
  const replanMatch = evidence.match(/^replan-transform:(.+):(.+)=>(.+)$/i);
  if (replanMatch?.[1] && replanMatch?.[2] && replanMatch?.[3]) {
    return {
      path: replanMatch[1].trim(),
      from: replanMatch[2].trim(),
      to: replanMatch[3].trim(),
    };
  }
  const rebindMatch = evidence.match(
    /^rebind-transform:(.+):.+=>.+->(.+)=>(.+)$/i,
  );
  if (rebindMatch?.[1] && rebindMatch?.[2] && rebindMatch?.[3]) {
    return {
      path: rebindMatch[1].trim(),
      from: rebindMatch[2].trim(),
      to: rebindMatch[3].trim(),
    };
  }
  // Stale-transform blocker evidence is history, not executable proof.
  return undefined;
}

export function inferReplaceDirectiveFromContinuationEvidence(input: {
  readonly evidence: readonly string[];
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
  readonly rebindTarget: (
    candidatePath: string,
    workspaceRoot: string,
  ) => string | undefined;
}): { from: string; to: string } | undefined {
  const preferredTarget = input.preferredTarget
    ? normalizePathLike(input.preferredTarget)
    : undefined;
  for (let index = input.evidence.length - 1; index >= 0; index -= 1) {
    const entry = input.evidence[index];
    if (!entry) {
      continue;
    }
    const parsed = parseContinuationTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    const reboundPath =
      input.rebindTarget(parsed.path, input.workspaceRoot) ??
      normalizePathLike(parsed.path);
    if (preferredTarget && normalizePathLike(reboundPath) !== preferredTarget) {
      continue;
    }
    return { from: parsed.from, to: parsed.to };
  }
  return undefined;
}

export function collectContinuationTransformsFromEvidence(input: {
  readonly evidence: readonly string[];
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
  readonly rebindTarget: (
    candidatePath: string,
    workspaceRoot: string,
  ) => string | undefined;
}): ContinuationTransformEvidence[] {
  const target = input.preferredTarget
    ? normalizePathLike(input.preferredTarget)
    : undefined;
  const transforms: ContinuationTransformEvidence[] = [];
  for (const entry of input.evidence) {
    const parsed = parseContinuationTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    const normalizedPath = normalizePathLike(
      input.rebindTarget(parsed.path, input.workspaceRoot) ?? parsed.path,
    );
    if (target && normalizedPath !== target) {
      continue;
    }
    transforms.push({
      path: normalizedPath,
      from: parsed.from,
      to: parsed.to,
    });
  }
  return transforms;
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
