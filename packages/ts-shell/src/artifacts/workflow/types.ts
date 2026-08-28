export type ArtifactKind = "report" | "structured-data" | "summary" | "export";

export type ArtifactValidationState =
  | "not-applicable"
  | "intent-created"
  | "output-missing"
  | "source-missing"
  | "unsafe-path"
  | "invalid"
  | "claim-evidence-missing"
  | "validation-failed"
  | "validation-passed"
  | "not-proven";

export interface ArtifactReceiptInput {
  readonly taskKind: string;
  readonly outputKind: string;
  readonly requiredPaths: readonly string[];
  readonly workspacePaths: readonly string[];
  readonly verificationState: string;
  readonly failureCategories: readonly string[];
  readonly requiredContentMarkers?: readonly string[];
  readonly observedContentMarkers?: readonly string[];
  readonly verificationEvidence?: readonly string[];
  readonly claimEvidence?: readonly {
    readonly claim: string;
    readonly evidenceId?: string;
    readonly sourcePath?: string;
    readonly verificationEvidenceId?: string;
  }[];
}

export interface ArtifactReceipt {
  readonly intent: string;
  readonly kind: ArtifactKind;
  readonly sourceReceipts: readonly {
    readonly path: string;
    readonly available: boolean;
  }[];
  readonly scopeExpectation: string;
  readonly outputPath?: string;
  readonly formatExpectation: string;
  readonly validationCheck: string;
  readonly requiredContentMarkers: readonly string[];
  readonly observedContentMarkers: readonly string[];
  readonly verificationEvidenceReceipts: readonly string[];
  readonly claimEvidenceReceipts: readonly {
    readonly claim: string;
    readonly evidenceId?: string;
    readonly proven: boolean;
  }[];
  readonly validationState: ArtifactValidationState;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ArtifactCorrectionInput {
  readonly receipt?: ArtifactReceipt;
  readonly actions: readonly string[];
}

export interface ArtifactCorrection {
  readonly attempted: boolean;
  readonly validationState: ArtifactValidationState;
  readonly correctedPath?: string;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ArtifactClaimEvidenceProjection {
  readonly evidenceIds: readonly string[];
  readonly missingClaims: readonly string[];
}

export interface ArtifactLifecycleInput {
  readonly hasArtifactIntent: boolean;
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly evidenceFiles: readonly string[];
  readonly completeArtifactProof: boolean;
}

export interface ArtifactLifecycleProjection {
  readonly written: boolean;
  readonly sourceMissing: boolean;
  readonly verificationMissing: boolean;
  readonly pending: boolean;
  readonly completed: boolean;
  readonly targetFiles: readonly string[];
}
