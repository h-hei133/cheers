import type { CodingResultSummary, OrchestrationStatus, TerminalReason } from "../../orchestration/types.js";

export interface CliSessionProductSurfaceInput {
  readonly status: OrchestrationStatus;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly terminalReason: TerminalReason;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
}

export interface CliSessionProductSurface {
  readonly lines: readonly string[];
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
}

export function projectCliSessionProductSurface(
  input: CliSessionProductSurfaceInput,
): CliSessionProductSurface | undefined {
  const codingResult = input.codingResult;
  if (!codingResult) {
    return undefined;
  }

  const notProvenClaims = extractNotProvenClaims(codingResult);
  const verdict = humanVerdict(input, codingResult);
  const nextAction = nextActionFor(input, codingResult);
  const lines = [
    "Product experience",
    `- Task: ${codingResult.taskKind}`,
    `- Context: ${contextSummary(codingResult)}`,
    `- Plan: ${planSummary(codingResult)}`,
    `- Proposal: ${proposalSummary(codingResult)}`,
    `- Authority: ${authoritySummary(codingResult)}`,
    `- Apply: ${applySummary(codingResult)}`,
    `- Verification: ${verificationSummary(codingResult)}`,
    `- Repair: ${repairSummary(codingResult)}`,
    `- Tools: ${toolSummary(codingResult)}`,
    `- Verdict: ${verdict}`,
    `- Not proven: ${notProvenClaims.length > 0 ? notProvenClaims.join("; ") : "none"}`,
    `- Next action: ${nextAction}`,
    "",
  ];

  return {
    lines,
    verdict,
    notProvenClaims,
    nextAction,
  };
}

function contextSummary(codingResult: CodingResultSummary): string {
  if (codingResult.diagnosis) {
    return `${codingResult.diagnosis.disposition}; evidenceFiles=${codingResult.diagnosis.evidenceFiles.length}; candidates=${codingResult.diagnosis.candidateFiles.length}`;
  }
  const attempted = codingResult.changeSet.attemptedFiles.length;
  const evidence = codingResult.evidence.length;
  return `attemptedFiles=${attempted}; evidence=${evidence}; raw-content=excluded`;
}

function planSummary(codingResult: CodingResultSummary): string {
  const required = codingResult.taskSatisfaction.requiredEvidence[0] ?? "current task contract";
  const reason = codingResult.taskSatisfaction.reasons[0] ?? "no additional plan note";
  return `${required}; ${compact(reason)}`;
}

function proposalSummary(codingResult: CodingResultSummary): string {
  const proposalSource = markerValue(codingResult.evidence, "proposal-source:") ??
    markerValue(codingResult.evidence, "tool-ecosystem:source:") ??
    "not-proven";
  const state = markerValue(codingResult.evidence, "proposal-state:") ??
    (codingResult.patches && codingResult.patches.length > 0 ? "applied-record-present" : "not-present");
  const targets = codingResult.changeSet.attemptedFiles.length > 0
    ? codingResult.changeSet.attemptedFiles.join(", ")
    : "none";
  const anchor = markerValue(codingResult.evidence, "anchor-quality:") ?? "not-proven";
  return `source=${proposalSource}; state=${state}; targets=${targets}; anchor=${anchor}`;
}

function authoritySummary(codingResult: CodingResultSummary): string {
  if (codingResult.evidence.some((entry) => entry.includes("authority:granted"))) {
    return "explicit authority granted by product contract";
  }
  if (
    codingResult.evidence.some((entry) => entry.includes("authority:required")) ||
    codingResult.verification.blockerKind === "approval-denied"
  ) {
    return "authority required; prompt text alone does not grant apply, verify, repair, tool, or provider authority";
  }
  if (codingResult.changedFiles.length > 0) {
    return "authority consumed for recorded mutation path";
  }
  return "no mutation authority granted";
}

function applySummary(codingResult: CodingResultSummary): string {
  if (codingResult.changedFiles.length > 0) {
    return `changed=${codingResult.changedFiles.join(", ")}; failed=${codingResult.failedFiles.length}`;
  }
  if (codingResult.failedFiles.length > 0) {
    return `changed=none; failed=${codingResult.failedFiles.map((entry) => `${entry.path} (${entry.reason})`).join("; ")}`;
  }
  return "not-run";
}

function verificationSummary(codingResult: CodingResultSummary): string {
  const command = codingResult.verification.command ?? "not-selected";
  const reason = codingResult.verification.reason ? `; reason=${compact(codingResult.verification.reason)}` : "";
  const blocker = codingResult.verification.blockerKind ? `; blocker=${codingResult.verification.blockerKind}` : "";
  const scope = codingResult.verification.selectionScope ? `; scope=${codingResult.verification.selectionScope}` : "";
  return `status=${codingResult.verification.status}; command=${command}${scope}${blocker}${reason}`;
}

function repairSummary(codingResult: CodingResultSummary): string {
  const notes = codingResult.repair.notes.length > 0
    ? `; notes=${codingResult.repair.notes.map(compact).join(" | ")}`
    : "";
  const originalFailure = codingResult.evidence.some((entry) => entry.includes("original-failure-preserved"))
    ? "; original-failure=preserved"
    : "";
  return `status=${codingResult.repair.status}; attempts=${codingResult.repair.attempts}${originalFailure}${notes}`;
}

function toolSummary(codingResult: CodingResultSummary): string {
  const toolMarkers = codingResult.evidence
    .filter((entry) =>
      entry.startsWith("tool-ecosystem:receipt:") ||
      entry.startsWith("tool-ecosystem:source:") ||
      entry.startsWith("tool-ecosystem:relevance:") ||
      entry.startsWith("runtime-receipt:"),
    )
    .slice(0, 5);
  const provenance = codingResult.provenance?.toolExecutions ?? [];
  if (toolMarkers.length === 0 && provenance.length === 0) {
    return "not-used";
  }
  const provenanceSummary = provenance
    .slice(-2)
    .map((entry) => `${entry.toolName}:${entry.kind}`)
    .join(", ");
  return [
    toolMarkers.length > 0 ? `receipts=${toolMarkers.length}` : undefined,
    provenanceSummary ? `executions=${provenanceSummary}` : undefined,
    "task-success-requires-relevance",
  ].filter(Boolean).join("; ");
}

function humanVerdict(
  input: CliSessionProductSurfaceInput,
  codingResult: CodingResultSummary,
): string {
  if (
    codingResult.verification.status === "passed" &&
    codingResult.repair.status === "recovered"
  ) {
    return "Verified success with repair: initial failure was repaired and re-verification passed.";
  }
  if (input.terminalClassification === "success" && codingResult.verification.status === "passed") {
    return "Verified success: relevant verification passed.";
  }
  if (input.terminalClassification === "stopped" && authoritySummary(codingResult).startsWith("authority required")) {
    return "Stopped: explicit authority is required before continuing.";
  }
  if (codingResult.verification.status === "failed") {
    return "Stopped: verification failed and repair or inspection is required.";
  }
  if (codingResult.taskSatisfaction.verdict === "completed-with-caveats") {
    return "Partial: some work completed, but required evidence is incomplete.";
  }
  if (input.terminalClassification !== "success") {
    return `Blocked: ${compact(input.stopReason ?? input.terminalReason)}`;
  }
  if (codingResult.taskSatisfaction.verdict === "insufficient-evidence") {
    return "Not proven: the system did not gather enough evidence to claim success.";
  }
  return "Completed: no additional verification was required.";
}

function extractNotProvenClaims(codingResult: CodingResultSummary): readonly string[] {
  const claims = codingResult.evidence
    .filter((entry) => entry.startsWith("not-proven:"))
    .map((entry) => compact(entry.slice("not-proven:".length), 120));
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

function nextActionFor(
  input: CliSessionProductSurfaceInput,
  codingResult: CodingResultSummary,
): string {
  return compact(
    codingResult.verification.nextAction ??
      codingResult.taskSatisfaction.reasons[0] ??
      input.stopReason ??
      "Continue with the next requested step.",
    180,
  );
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker ? compact(marker.slice(prefix.length), 120) : undefined;
}

function compact(value: string, maxLength = 160): string {
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
