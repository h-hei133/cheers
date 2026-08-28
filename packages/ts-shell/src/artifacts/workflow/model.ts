import type {
  ArtifactLifecycleInput,
  ArtifactLifecycleProjection,
  ArtifactReceipt,
  ArtifactReceiptInput,
} from "./types.js";
import {
  claimEvidenceReceiptsFor,
  safeEvidence,
  uniqueEvidence,
} from "./claim.js";
import {
  artifactBlockersFor,
  artifactKindFor,
  artifactValidationStateFor,
  formatExpectationFor,
  validationCheckFor,
} from "./correction.js";

export * from "./types.js";
export * from "./claim.js";
export * from "./correction.js";

export function createArtifactReceipt(input: ArtifactReceiptInput): ArtifactReceipt | undefined {
  if (input.outputKind !== "artifact") {
    return undefined;
  }
  const outputPath = input.requiredPaths[0];
  const kind = artifactKindFor(input.taskKind, outputPath);
  const sourceReceipts = input.workspacePaths
    .filter((path) => path !== outputPath)
    .map((path) => Object.freeze({ path, available: true }));
  const validationState = artifactValidationStateFor(input);
  const blockers = artifactBlockersFor(input, validationState);

  return Object.freeze({
    intent: `produce ${kind} artifact`,
    kind,
    sourceReceipts,
    scopeExpectation: "use only task-scoped sources and required output paths",
    outputPath,
    formatExpectation: formatExpectationFor(kind, outputPath),
    validationCheck: validationCheckFor(kind),
    requiredContentMarkers: Object.freeze([...(input.requiredContentMarkers ?? [])]),
    observedContentMarkers: Object.freeze([...(input.observedContentMarkers ?? [])]),
    verificationEvidenceReceipts: Object.freeze(safeEvidence(input.verificationEvidence ?? [])),
    claimEvidenceReceipts: Object.freeze(claimEvidenceReceiptsFor(input)),
    validationState,
    blockers,
    terminalSuccessClaim: false,
  });
}

export function projectArtifactLifecycle(input: ArtifactLifecycleInput): ArtifactLifecycleProjection {
  if (!input.hasArtifactIntent) {
    return Object.freeze({
      written: false,
      sourceMissing: false,
      verificationMissing: false,
      pending: false,
      completed: false,
      targetFiles: Object.freeze([]),
    });
  }
  const targetFiles = Object.freeze(uniqueEvidence([
    ...input.changedFiles,
    ...input.verifiedFiles,
    ...input.evidenceFiles,
  ]));
  return Object.freeze({
    written: input.changedFiles.length > 0,
    sourceMissing: !input.completeArtifactProof && input.verifiedFiles.length > 0,
    verificationMissing: !input.completeArtifactProof && input.verifiedFiles.length === 0,
    pending: !input.completeArtifactProof,
    completed: input.completeArtifactProof,
    targetFiles,
  });
}
