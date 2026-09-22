import type {
  ArtifactClaimEvidenceProjection,
  ArtifactReceiptInput,
} from "./types.js";

export function projectArtifactClaimEvidence(input: {
  readonly claims: readonly string[];
  readonly evidence: readonly string[];
}): ArtifactClaimEvidenceProjection {
  const usedEvidenceIds = new Set<string>();
  const evidenceIds: string[] = [];
  const missingClaims: string[] = [];

  for (const claim of input.claims) {
    const evidenceId = input.evidence.find((item) => claimEvidenceProven({ claim, evidenceId: item }, usedEvidenceIds));
    if (evidenceId) {
      evidenceIds.push(evidenceId);
    } else {
      missingClaims.push(claim.replace(/\s+/g, " ").trim().slice(0, 180));
    }
  }

  return Object.freeze({
    evidenceIds: Object.freeze(evidenceIds),
    missingClaims: Object.freeze(missingClaims),
  });
}

export function claimEvidenceSatisfied(input: ArtifactReceiptInput): boolean {
  const claims = input.claimEvidence ?? [];
  const usedEvidenceIds = new Set<string>();
  return claims.every((item) => claimEvidenceProven(item, usedEvidenceIds, input));
}

export function claimEvidenceReceiptsFor(input: ArtifactReceiptInput): readonly {
  readonly claim: string;
  readonly evidenceId?: string;
  readonly proven: boolean;
}[] {
  const usedEvidenceIds = new Set<string>();
  return (input.claimEvidence ?? []).map((item) => Object.freeze({
    claim: item.claim.replace(/\s+/g, " ").trim().slice(0, 180),
    ...(item.evidenceId?.trim() ? { evidenceId: item.evidenceId.trim().slice(0, 180) } : {}),
    proven: claimEvidenceProven(item, usedEvidenceIds, input),
  }));
}

export function claimEvidenceProven(
  item: {
    readonly claim: string;
    readonly evidenceId?: string;
    readonly sourcePath?: string;
    readonly verificationEvidenceId?: string;
  },
  usedEvidenceIds: Set<string>,
  context?: Pick<ArtifactReceiptInput, "requiredPaths" | "workspacePaths" | "verificationEvidence">,
): boolean {
  const evidenceId = item.evidenceId?.trim();
  const claim = item.claim.trim();
  if (!claim || !evidenceId || usedEvidenceIds.has(evidenceId)) {
    return false;
  }
  if (context && claimRequiresBoundEvidence(claim)) {
    if (!claimEvidenceBoundToContext(claim, evidenceId, item, context)) {
      return false;
    }
  } else if (!claimEvidenceMatches(claim, evidenceId)) {
    return false;
  }
  usedEvidenceIds.add(evidenceId);
  return true;
}

export function claimRequiresBoundEvidence(claim: string): boolean {
  const normalized = claim.toLowerCase();
  return normalized.includes("source") ||
    normalized.includes("verification") ||
    normalized.includes("validat") ||
    normalized.includes("check");
}

export function claimEvidenceBoundToContext(
  claim: string,
  evidenceId: string,
  item: { readonly sourcePath?: string; readonly verificationEvidenceId?: string },
  context: Pick<ArtifactReceiptInput, "requiredPaths" | "workspacePaths" | "verificationEvidence">,
): boolean {
  const normalizedClaim = claim.toLowerCase();
  if (
    normalizedClaim.includes("verification") ||
    normalizedClaim.includes("validat") ||
    normalizedClaim.includes("check")
  ) {
    const evidence = item.verificationEvidenceId?.trim() || evidenceId;
    return (context.verificationEvidence ?? []).some((receipt) => sameEvidence(receipt, evidence));
  }
  if (normalizedClaim.includes("source")) {
    const source = item.sourcePath?.trim() || evidenceId;
    const sourcePaths = context.workspacePaths.filter((path) => !context.requiredPaths.includes(path));
    return sourcePaths.some((path) => pathEvidenceMatches(path, source));
  }
  return true;
}

export function claimEvidenceMatches(claim: string, evidenceId: string): boolean {
  const normalizedClaim = claim.toLowerCase();
  const normalizedEvidence = evidenceId.toLowerCase();
  if (normalizedClaim.includes("verification")) {
    return normalizedEvidence.includes("verification") ||
      normalizedEvidence.includes("check") ||
      normalizedEvidence.includes("passed");
  }
  if (normalizedClaim.includes("source")) {
    return normalizedEvidence.includes("source") ||
      normalizedEvidence.includes("receipt") ||
      normalizedEvidence.includes("covered");
  }
  return normalizedClaim
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .some((token) => normalizedEvidence.includes(token));
}

export function sameEvidence(left: string, right: string): boolean {
  return normalizeEvidence(left) === normalizeEvidence(right);
}

export function pathEvidenceMatches(path: string, evidence: string): boolean {
  const normalizedPath = normalizeEvidence(path);
  const normalizedEvidence = normalizeEvidence(evidence);
  if (!normalizedPath || !normalizedEvidence) {
    return false;
  }
  const pathStem = sourceStem(normalizedPath);
  const evidenceStem = sourceStem(normalizedEvidence);
  const stemMatch = Boolean(pathStem && evidenceStem && pathStem.includes(evidenceStem));
  return normalizedPath.includes(normalizedEvidence) ||
    normalizedEvidence.includes(normalizedPath) ||
    stemMatch;
}

export function sourceStem(value: string): string {
  const parts = value.split("/");
  const basename = parts[parts.length - 1] ?? value;
  const stripped = basename.replace(/\.[a-z0-9]+$/i, "");
  return stripped.length > 0 ? stripped : basename;
}

export function normalizeEvidence(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function safeEvidence(evidence: readonly string[]): readonly string[] {
  return evidence.map((item) => item.replace(/\s+/g, " ").trim().slice(0, 180));
}

export function uniqueEvidence(evidence: readonly string[]): readonly string[] {
  return [...new Set(safeEvidence(evidence).filter(Boolean))];
}
