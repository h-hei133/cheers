import type {
  ArtifactCorrection,
  ArtifactCorrectionInput,
  ArtifactKind,
  ArtifactReceiptInput,
  ArtifactValidationState,
} from "./types.js";
import { claimEvidenceSatisfied } from "./claim.js";

export function correctArtifact(input: ArtifactCorrectionInput): ArtifactCorrection | undefined {
  if (!input.receipt) {
    return undefined;
  }
  const canCorrect = input.actions.includes("artifact") && input.receipt.sourceReceipts.every((source) => source.available);
  if (!canCorrect) {
    return Object.freeze({
      attempted: false,
      validationState: input.receipt.validationState,
      correctedPath: input.receipt.outputPath,
      blockers: input.receipt.blockers.length > 0 ? input.receipt.blockers : ["artifact correction unavailable"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "unsafe-path") {
    return Object.freeze({
      attempted: false,
      validationState: "unsafe-path",
      correctedPath: input.receipt.outputPath,
      blockers: ["unsafe artifact path"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "source-missing") {
    return Object.freeze({
      attempted: false,
      validationState: "source-missing",
      correctedPath: input.receipt.outputPath,
      blockers: ["artifact source missing"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.validationState === "claim-evidence-missing") {
    return Object.freeze({
      attempted: false,
      validationState: "claim-evidence-missing",
      correctedPath: input.receipt.outputPath,
      blockers: ["artifact claim evidence missing"],
      terminalSuccessClaim: false,
    });
  }
  if (input.receipt.claimEvidenceReceipts.some((receipt) => !receipt.proven)) {
    return Object.freeze({
      attempted: false,
      validationState: "claim-evidence-missing",
      correctedPath: input.receipt.outputPath,
      blockers: ["artifact claim evidence missing"],
      terminalSuccessClaim: false,
    });
  }
  return Object.freeze({
    attempted: true,
    validationState: "validation-passed",
    correctedPath: input.receipt.outputPath,
    blockers: [],
    terminalSuccessClaim: false,
  });
}

export function artifactKindFor(taskKind: string, outputPath: string | undefined): ArtifactKind {
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

export function artifactValidationStateFor(input: ArtifactReceiptInput): ArtifactValidationState {
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

export function requiredContentSatisfied(input: ArtifactReceiptInput): boolean {
  const required = input.requiredContentMarkers ?? [];
  if (required.length === 0) return true;
  const observed = new Set(input.observedContentMarkers ?? []);
  return required.every((marker) => observed.has(marker));
}

export function artifactBlockersFor(
  _input: ArtifactReceiptInput,
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

export function formatExpectationFor(kind: ArtifactKind, outputPath: string | undefined): string {
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

export function validationCheckFor(kind: ArtifactKind): string {
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
