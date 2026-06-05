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

export function createArtifactReceipt(input: ArtifactReceiptInput): ArtifactReceipt | undefined {
  if (input.outputKind !== "artifact") {
    return undefined;
  }
  const outputPath = input.requiredPaths[0];
  const kind = artifactKindFor(input.taskKind, outputPath);
  const sourceReceipts = input.workspacePaths
    .filter((path) => path !== outputPath)
    .map((path) => freeze({ path, available: true }));
  const validationState = artifactValidationStateFor(input);
  const blockers = artifactBlockersFor(input, validationState);

  return freeze({
    intent: `produce ${kind} artifact`,
    kind,
    sourceReceipts,
    scopeExpectation: "use only task-scoped sources and required output paths",
    outputPath,
    formatExpectation: formatExpectationFor(kind, outputPath),
    validationCheck: validationCheckFor(kind),
    requiredContentMarkers: freeze([...(input.requiredContentMarkers ?? [])]),
    observedContentMarkers: freeze([...(input.observedContentMarkers ?? [])]),
    verificationEvidenceReceipts: freeze(safeEvidence(input.verificationEvidence ?? [])),
    claimEvidenceReceipts: freeze(claimEvidenceReceiptsFor(input)),
    validationState,
    blockers,
    terminalSuccessClaim: false,
  });
}

export function correctArtifact(input: ArtifactCorrectionInput): ArtifactCorrection | undefined {
  if (!input.receipt) {
    return undefined;
  }
  const canCorrect = input.actions.includes("artifact") && input.receipt.sourceReceipts.every((source) => source.available);
  if (!canCorrect) {
    return freeze({
      attempted: false,
      validationState: input.receipt.validationState,
      correctedPath: input.receipt.outputPath,
      blockers: input.receipt.blockers.length > 0 ? input.receipt.blockers : ["artifact correction unavailable"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "unsafe-path") {
    return freeze({
      attempted: false,
      validationState: "unsafe-path",
      correctedPath: input.receipt.outputPath,
      blockers: ["unsafe artifact path"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "source-missing") {
    return freeze({
      attempted: false,
      validationState: "source-missing",
      correctedPath: input.receipt.outputPath,
      blockers: ["artifact source missing"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "claim-evidence-missing") {
    return freeze({
      attempted: false,
      validationState: "claim-evidence-missing",
      correctedPath: input.receipt.outputPath,
      blockers: ["artifact claim evidence missing"],
      terminalSuccessClaim: false,
    });
  }
  return freeze({
    attempted: true,
    validationState: "validation-passed",
    correctedPath: input.receipt.outputPath,
    blockers: [],
    terminalSuccessClaim: false,
  });
}

function artifactKindFor(taskKind: string, outputPath: string | undefined): ArtifactKind {
  if (taskKind === "docs-report") {
    return "report";
  }
  if (taskKind === "data-artifact" || outputPath?.endsWith(".json")) {
    return "structured-data";
  }
  if (taskKind === "live-triage") {
    return "export";
  }
  return "summary";
}

function artifactValidationStateFor(input: ArtifactReceiptInput): ArtifactValidationState {
  if (input.requiredPaths.length === 0) {
    return "output-missing";
  }
  if (input.requiredPaths.some((path) => path.startsWith("/") || path.includes(".."))) {
    return "unsafe-path";
  }
  if (input.failureCategories.includes("unsupported capability")) {
    return "not-proven";
  }
  if (input.workspacePaths.length <= input.requiredPaths.length) {
    return "source-missing";
  }
  if (input.failureCategories.includes("artifact invalid")) {
    return input.verificationState === "selected-failed" ? "validation-failed" : "invalid";
  }
  if (!requiredContentSatisfied(input)) {
    return input.verificationState === "selected-failed" ? "validation-failed" : "invalid";
  }
  if (!claimEvidenceSatisfied(input)) {
    return "claim-evidence-missing";
  }
  if ((input.verificationEvidence ?? []).length === 0) {
    return "not-proven";
  }
  if (input.verificationState === "selected-passed") {
    return "validation-passed";
  }
  if (input.verificationState === "selected-not-run" || input.verificationState === "not-selected") {
    return "not-proven";
  }
  return "intent-created";
}

function claimEvidenceSatisfied(input: ArtifactReceiptInput): boolean {
  const claims = input.claimEvidence ?? [];
  const evidenceIds = claims
    .map((item) => item.evidenceId?.trim())
    .filter((value): value is string => Boolean(value));
  return claims.every((item) => Boolean(item.claim.trim()) && Boolean(item.evidenceId?.trim())) &&
    new Set(evidenceIds).size === evidenceIds.length;
}

function claimEvidenceReceiptsFor(input: ArtifactReceiptInput): readonly {
  readonly claim: string;
  readonly evidenceId?: string;
  readonly proven: boolean;
}[] {
  return (input.claimEvidence ?? []).map((item) => freeze({
    claim: item.claim.replace(/\s+/g, " ").trim().slice(0, 180),
    ...(item.evidenceId?.trim() ? { evidenceId: item.evidenceId.trim().slice(0, 180) } : {}),
    proven: Boolean(item.claim.trim()) && Boolean(item.evidenceId?.trim()),
  }));
}

function requiredContentSatisfied(input: ArtifactReceiptInput): boolean {
  const required = input.requiredContentMarkers ?? [];
  if (required.length === 0) return true;
  const observed = new Set(input.observedContentMarkers ?? []);
  return required.every((marker) => observed.has(marker));
}

function safeEvidence(evidence: readonly string[]): readonly string[] {
  return evidence.map((item) => item.replace(/\s+/g, " ").trim().slice(0, 180));
}

function artifactBlockersFor(
  input: ArtifactReceiptInput,
  state: ArtifactValidationState,
): readonly string[] {
  switch (state) {
    case "output-missing":
      return ["artifact output path missing"];
    case "unsafe-path":
      return ["unsafe artifact path"];
    case "source-missing":
      return ["artifact source missing"];
    case "invalid":
      return ["artifact invalid"];
    case "validation-failed":
      return ["artifact validation failed"];
    case "claim-evidence-missing":
      return ["artifact claim evidence missing"];
    case "not-proven":
      return ["artifact validation not proven"];
    case "intent-created":
      return ["artifact validation not run"];
    case "validation-passed":
    case "not-applicable":
      return [];
  }
}

function formatExpectationFor(kind: ArtifactKind, outputPath: string | undefined): string {
  if (kind === "structured-data") {
    return "valid JSON with task totals";
  }
  if (kind === "report") {
    return "markdown report with source-scoped facts";
  }
  if (kind === "export") {
    return "durable export handle";
  }
  return outputPath ? "task summary artifact" : "durable artifact handle";
}

function validationCheckFor(kind: ArtifactKind): string {
  if (kind === "structured-data") {
    return "parse and compare structured fields";
  }
  if (kind === "report") {
    return "check source coverage and required scope";
  }
  if (kind === "export") {
    return "check durable handle and supported format";
  }
  return "inspect required artifact facts";
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
