import { createHash } from "node:crypto";

export type SingleFileApplyPatchBaseEvidencePhase = "dry-run-preview";

export type SingleFileApplyPatchBaseEvidenceSource = "verify-readFile";

export interface SingleFileApplyPatchBaseEvidence {
  readonly targetPath: string;
  readonly baseDigest: string;
  readonly digestAlgorithm: "sha256";
  readonly capturedAtPhase: SingleFileApplyPatchBaseEvidencePhase;
  readonly source: SingleFileApplyPatchBaseEvidenceSource;
}

export function buildSingleFileApplyPatchBaseEvidence(input: {
  readonly targetPath: string;
  readonly baseContent: string;
  readonly capturedAtPhase?: SingleFileApplyPatchBaseEvidencePhase;
  readonly source?: SingleFileApplyPatchBaseEvidenceSource;
}): SingleFileApplyPatchBaseEvidence {
  return {
    targetPath: input.targetPath,
    baseDigest: digestSingleFileApplyPatchContent(input.baseContent),
    digestAlgorithm: "sha256",
    capturedAtPhase: input.capturedAtPhase ?? "dry-run-preview",
    source: input.source ?? "verify-readFile",
  };
}

export function digestSingleFileApplyPatchContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
