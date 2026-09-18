import type {
  CodingResultSummary,
  OrchestrationStatus,
  TerminalReason,
} from "../../result/types.js";

export interface SessionPresentationFactsInput {
  readonly status: OrchestrationStatus;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly terminalReason: TerminalReason;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
}

export type SessionPresentationTruthStatus =
  | "verified-success"
  | "verified-repaired-success"
  | "stopped-authority-required"
  | "verification-failed"
  | "partial"
  | "blocked"
  | "not-proven"
  | "completed-no-verification-required";

export interface SessionPresentationFacts {
  readonly truthStatus: SessionPresentationTruthStatus;
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
  readonly resultSessionCliSuccessUpgrade: false;
}

export function projectSessionPresentationFacts(
  input: SessionPresentationFactsInput,
): SessionPresentationFacts | undefined {
  const codingResult = input.codingResult;
  if (!codingResult) {
    return undefined;
  }

  const truthStatus = classifySessionPresentationTruth(input, codingResult);
  return {
    truthStatus,
    verdict: verdictFor(truthStatus, input),
    notProvenClaims: extractSessionNotProvenClaims(codingResult),
    nextAction: sessionNextActionFor(input, codingResult),
    resultSessionCliSuccessUpgrade: false,
  };
}

export function classifySessionPresentationTruth(
  input: SessionPresentationFactsInput,
  codingResult: CodingResultSummary,
): SessionPresentationTruthStatus {
  if (
    codingResult.verification.status === "passed" &&
    codingResult.repair.status === "recovered"
  ) {
    return "verified-repaired-success";
  }
  if (
    input.terminalClassification === "success" &&
    codingResult.verification.status === "passed"
  ) {
    return "verified-success";
  }
  if (
    input.terminalClassification === "stopped" &&
    hasAuthorityRequired(codingResult)
  ) {
    return "stopped-authority-required";
  }
  if (codingResult.verification.status === "failed") {
    return "verification-failed";
  }
  if (codingResult.taskSatisfaction.verdict === "completed-with-caveats") {
    return "partial";
  }
  if (input.terminalClassification !== "success") {
    return "blocked";
  }
  if (codingResult.taskSatisfaction.verdict === "insufficient-evidence") {
    return "not-proven";
  }
  return "completed-no-verification-required";
}

export function extractSessionNotProvenClaims(
  codingResult: CodingResultSummary,
): readonly string[] {
  const claims = codingResult.evidence
    .filter((entry) => entry.startsWith("not-proven:"))
    .map((entry) =>
      compactSessionPresentationText(entry.slice("not-proven:".length), 120),
    );
  if (codingResult.verification.status !== "passed") {
    claims.push("relevant verification did not pass");
  }
  if (
    codingResult.evidence.some((entry) => entry.includes("no-external-live-claim")) &&
    !claims.includes("external-live tool execution")
  ) {
    claims.push("external-live tool execution");
  }
  return Array.from(new Set(claims)).slice(0, 8);
}

export function sessionNextActionFor(
  input: SessionPresentationFactsInput,
  codingResult: CodingResultSummary,
): string {
  return compactSessionPresentationText(
    codingResult.verification.nextAction ??
      codingResult.taskSatisfaction.reasons[0] ??
      input.stopReason ??
      "Continue with the next requested step.",
    180,
  );
}

export function compactSessionPresentationText(
  value: string,
  maxLength = 160,
): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/<body[\s\S]*?<\/body>/gi, "[raw-content-excluded]")
    .replace(/\b(raw[_ -]?provider[_ -]?output)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(oldText|newText)\b\s*[:=]\s*\S+/g, "$1=[redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function verdictFor(
  truthStatus: SessionPresentationTruthStatus,
  input: SessionPresentationFactsInput,
): string {
  switch (truthStatus) {
    case "verified-repaired-success":
      return "Verified success with repair: initial failure was repaired and re-verification passed.";
    case "verified-success":
      return "Verified success: relevant verification passed.";
    case "stopped-authority-required":
      return "Stopped: explicit authority is required before continuing.";
    case "verification-failed":
      return "Stopped: verification failed and repair or inspection is required.";
    case "partial":
      return "Partial: some work completed, but required evidence is incomplete.";
    case "blocked":
      return `Blocked: ${compactSessionPresentationText(input.stopReason ?? input.terminalReason)}`;
    case "not-proven":
      return "Not proven: the system did not gather enough evidence to claim success.";
    case "completed-no-verification-required":
      return "Completed: no additional verification was required.";
  }
}

function hasAuthorityRequired(codingResult: CodingResultSummary): boolean {
  return (
    codingResult.evidence.some((entry) => entry.includes("authority:required")) ||
    codingResult.verification.blockerKind === "approval-denied"
  );
}
