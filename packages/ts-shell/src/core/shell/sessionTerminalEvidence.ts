import type {
  CodingResultSummary,
  ContinuationReason,
  TerminalReason,
} from "../../result/types.js";
import type { QueryEvent } from "../query/runtime/events.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { parseRunCommandAllowlistBlockContext } from "./sessionTerminalState.js";

/**
 * Terminal evidence formatting.
 *
 * Builds the evidence, change, failure, and verification lines the terminal
 * result block renders. Everything here reads a completed result and produces
 * text; nothing here decides a terminal status.
 */

export function renderContinuationSeedSummary(
  renderer: StreamingRenderer,
  input: {
    codingResult: CodingResultSummary | undefined;
    notes: readonly string[];
    handoffSummary?: string;
    seedInfluenceHandoffSummary?: string;
    failureHandoffDiagnostic?: string;
    successHandoffDiagnostic?: string;
  },
): void {
  const summary = buildContinuationSeedSummary(input);
  if (!summary) {
    return;
  }
  renderer.renderLine("Continuation");
  renderer.renderLine(`- ${summary}`);
  renderer.renderLine("");
}

function buildContinuationSeedSummary(input: {
  codingResult: CodingResultSummary | undefined;
  notes: readonly string[];
  handoffSummary?: string;
  seedInfluenceHandoffSummary?: string;
  failureHandoffDiagnostic?: string;
  successHandoffDiagnostic?: string;
}): string | undefined {
  const failureDiagnostic = input.failureHandoffDiagnostic?.trim();
  const successDiagnostic = failureDiagnostic
    ? undefined
    : input.successHandoffDiagnostic?.trim();
  if (input.seedInfluenceHandoffSummary?.trim()) {
    const summary = input.handoffSummary?.trim()
      ? `${input.handoffSummary.trim()} ${input.seedInfluenceHandoffSummary.trim()}`
      : input.seedInfluenceHandoffSummary.trim();
    if (failureDiagnostic) {
      return `${summary} ${failureDiagnostic}`;
    }
    return successDiagnostic ? `${summary} ${successDiagnostic}` : summary;
  }
  if (input.handoffSummary?.trim()) {
    if (failureDiagnostic) {
      return `${input.handoffSummary.trim()} ${failureDiagnostic}`;
    }
    return successDiagnostic
      ? `${input.handoffSummary.trim()} ${successDiagnostic}`
      : input.handoffSummary.trim();
  }
  if (failureDiagnostic) {
    return failureDiagnostic;
  }
  if (successDiagnostic) {
    return successDiagnostic;
  }
  if (!input.notes.some((note) => note.includes("seed=action-result"))) {
    return undefined;
  }

  const seed = input.codingResult?.lastActionResultSeed;
  const action =
    readDecisionTraceValue(input.notes, "seedAction") ??
    seed?.actionKind ??
    input.codingResult?.taskKind ??
    "previous action";
  const target =
    readDecisionTraceValue(input.notes, "seedTarget") ??
    seed?.target ??
    input.codingResult?.changedFiles[0] ??
    input.codingResult?.verifiedFiles[0];
  const verificationStatus =
    readDecisionTraceValue(input.notes, "seedVerifyStatus") ??
    seed?.verification?.status ??
    input.codingResult?.verification.status;
  const writerStarted =
    readDecisionTraceValue(input.notes, "seedWriterStarted") ??
    (seed?.writerStarted ? "yes" : undefined);
  const writeEffect =
    readDecisionTraceValue(input.notes, "seedWriteEffect") ??
    seed?.writeEffect;
  const requiresUserInspection =
    readDecisionTraceValue(input.notes, "seedRequiresUserInspection") ??
    (seed?.requiresUserInspection ? "yes" : undefined);
  const targetLabel = target ? ` on ${target}` : "";
  const focusLabel = target ? "the same target" : "the same task";
  const verificationLabel = verificationStatus
    ? `; verification status: ${verificationStatus}`
    : "";
  const writerLabel = writerStarted ? `; writer-started=${writerStarted}` : "";
  const writeEffectLabel = writeEffect ? `; write-effect=${writeEffect}` : "";
  const inspectionLabel = requiresUserInspection
    ? `; requires-user-inspection=${requiresUserInspection}`
    : "";

  return `Resumed from ${action}${targetLabel}${verificationLabel}${writerLabel}${writeEffectLabel}${inspectionLabel}; next focus is ${focusLabel}.`;
}

function readDecisionTraceValue(
  notes: readonly string[],
  key: string,
): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\s)${escapedKey}=([^\\s]+)`);
  for (const note of notes) {
    const value = note.match(pattern)?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function buildCodingSuccessEvidenceLines(
  codingResult: CodingResultSummary,
): string[] {
  const lines: string[] = [];
  if (codingResult.changedFiles.length > 0) {
    lines.push(`- Changed files: ${codingResult.changedFiles.join(", ")}`);
  }
  const readFiles = extractReadFiles(codingResult.evidence);
  if (readFiles.length > 0) {
    lines.push(`- Read files: ${readFiles.join(", ")}`);
  }
  if (
    readFiles.length > 0 &&
    codingResult.changedFiles.length === 0 &&
    codingResult.failedFiles.length === 0
  ) {
    const deliveredLines = extractReadDeliveredLines(codingResult.evidence);
    lines.push(
      `- Observed context: ${deliveredLines ? `delivered ${deliveredLines} line(s)` : "delivered read output"} from ${readFiles.join(", ")}.`,
    );
    lines.push("- No files changed: read/inspect only.");
  }
  const changeSummary = buildChangeSummary(codingResult.evidence);
  if (changeSummary && codingResult.changedFiles.length > 0) {
    lines.push(`- Change summary: ${changeSummary}`);
  }
  lines.push(...buildRepairContextEvidenceLines(codingResult.evidence));
  if (
    codingResult.verification.status === "passed" &&
    codingResult.verification.reason
  ) {
    lines.push(`- Verification evidence: ${codingResult.verification.reason}`);
  }
  const unchangedFiles = extractVerifiedUnchangedFiles(codingResult.evidence);
  if (unchangedFiles.length > 0) {
    lines.push(`- Confirmed unchanged: ${unchangedFiles.join(", ")}`);
  } else if (codingResult.changeSet.unchangedAttemptedFiles.length > 0) {
    lines.push(
      `- Unchanged attempted files: ${codingResult.changeSet.unchangedAttemptedFiles.join(", ")}`,
    );
  }
  return lines;
}

function buildRepairContextEvidenceLines(evidence: readonly string[]): string[] {
  if (evidence.includes("repairContextAbandoned:true")) {
    const abandonedReason = findEvidenceValue(
      evidence,
      "repairContextAbandonedReason:",
    );
    const abandonedFailureReason = findEvidenceValue(
      evidence,
      "repairContextAbandonedFailureReason:",
    );
    const abandonedTargetCount = findEvidenceValue(
      evidence,
      "repairContextAbandonedTargetCount:",
    );
    return [
      "- Repair context: repairContextUsed:false",
      "- Repair context abandoned: repairContextAbandoned:true",
      ...(abandonedReason
        ? [
            `- Repair context abandoned reason: repairContextAbandonedReason:${abandonedReason}`,
          ]
        : []),
      ...(abandonedFailureReason
        ? [
            `- Repair context abandoned failure reason: repairContextAbandonedFailureReason:${abandonedFailureReason}`,
          ]
        : []),
      ...(abandonedTargetCount
        ? [`- Repair context failed target candidates: ${abandonedTargetCount}`]
        : []),
      "- Repair context next action: specify the exact target file, or rerun as a fresh single-file edit.",
    ];
  }

  if (!evidence.includes("repairContextUsed:true")) {
    return [];
  }

  const repairedFailureReason = findEvidenceValue(
    evidence,
    "repairedFailureReason:",
  );
  const repairedTargetFile = findEvidenceValue(evidence, "repairedTargetFile:");
  const repairPayloadKind = findEvidenceValue(evidence, "repairPayloadKind:");

  return [
    "- Repair context: repairContextUsed:true",
    ...(repairedFailureReason
      ? [
          `- Repaired failure reason: repairedFailureReason:${repairedFailureReason}`,
        ]
      : []),
    ...(repairedTargetFile
      ? [`- Repaired target file: repairedTargetFile:${repairedTargetFile}`]
      : []),
    ...(repairPayloadKind
      ? [`- Repair payload kind: repairPayloadKind:${repairPayloadKind}`]
      : []),
  ];
}

function findEvidenceValue(
  evidence: readonly string[],
  prefix: string,
): string | undefined {
  return evidence
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function extractReadFiles(evidence: readonly string[]): string[] {
  const files: string[] = [];
  for (const entry of evidence) {
    const match = entry.match(/^inspect: read (.+)$/i);
    if (!match?.[1]) {
      continue;
    }
    const file = match[1].trim();
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }
  return files;
}

function extractReadDeliveredLines(
  evidence: readonly string[],
): string | undefined {
  const marker = evidence
    .map((entry) => entry.match(/^read-delivered-lines:(\d+)$/i)?.[1])
    .find((value): value is string => Boolean(value));
  return marker;
}

function buildChangeSummary(evidence: readonly string[]): string | undefined {
  const summaries = evidence
    .map((entry) => {
      const transform = entry.match(/^transform:([^:]+):(.+)=>(.+)$/i);
      if (!transform) {
        return undefined;
      }
      const [, file, from, to] = transform;
      return `${file}: replaced ${formatInlineEvidence(from)} with ${formatInlineEvidence(to)}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return summaries.length > 0 ? summaries.join("; ") : undefined;
}

function extractVerifiedUnchangedFiles(evidence: readonly string[]): string[] {
  const files: string[] = [];
  for (const entry of evidence) {
    const match = entry.match(/^verify-unchanged:(.+)$/i);
    if (!match?.[1]) {
      continue;
    }
    for (const file of match[1].split("|")) {
      const trimmed = file.trim();
      if (trimmed && !files.includes(trimmed)) {
        files.push(trimmed);
      }
    }
  }
  return files;
}

function formatInlineEvidence(value: string | undefined): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  const clipped =
    normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
  return `\`${clipped}\``;
}

export function buildCodingFailureSummary(
  codingResult: CodingResultSummary,
): string | undefined {
  const failedFile = codingResult.failedFiles.find((entry) =>
    entry.reason.trim(),
  );
  if (failedFile) {
    return `${failedFile.path}: ${failedFile.reason}`;
  }
  const failedPatch = codingResult.patches?.find(
    (record) => record.status === "failed" && record.reason?.trim(),
  );
  if (failedPatch?.reason) {
    return `${failedPatch.path}: ${failedPatch.reason}`;
  }
  if (codingResult.verification.status === "failed") {
    return codingResult.verification.reason ?? "Verification failed";
  }
  return undefined;
}

export function buildVerificationStatusDetail(
  codingResult: CodingResultSummary,
): string | undefined {
  const reason = codingResult.verification.reason?.trim();
  const reasonSuffix = reason ? ` Reason: ${reason}` : "";
  if (codingResult.verification.status === "not-requested") {
    if (codingResult.changedFiles.length > 0) {
      return `No verification was requested; changed files were not checked.${reasonSuffix}`;
    }
    return `No verification was requested for this turn.${reasonSuffix}`;
  }

  if (codingResult.verification.status === "blocked") {
    const blocker = codingResult.verification.blockerKind
      ? ` (${codingResult.verification.blockerKind})`
      : "";
    if (
      codingResult.changedFiles.length > 0 &&
      codingResult.failedFiles.length === 0
    ) {
      return `Edit succeeded, but verification could not run${blocker}.${reasonSuffix}`;
    }
    return `Verification could not run${blocker}.${reasonSuffix}`;
  }

  if (codingResult.verification.status === "failed") {
    const command = codingResult.verification.command
      ? ` (${codingResult.verification.command})`
      : "";
    return `Verification failed${command}.${reasonSuffix}`;
  }

  return undefined;
}

export function buildCodingResultNextAction(
  codingResult: CodingResultSummary,
): string | undefined {
  if (isApprovedToolExecutionFailure(codingResult)) {
    return "Inspect the command output/error, fix the execution failure, and rerun the command after approval if still needed.";
  }

  const candidateText = [
    ...codingResult.failedFiles.map((entry) => entry.reason),
    ...(codingResult.patches ?? []).map((record) => record.reason ?? ""),
    codingResult.verification.reason ?? "",
    ...codingResult.taskSatisfaction.reasons,
    codingResult.failureBoundary ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (
    /replacement not safely derivable|edit instruction is ambiguous|fenced replacement content|replace-from\/replace-to|replace-from/i.test(
      candidateText,
    )
  ) {
    return "Rerun with an explicit replace-from/to instruction or a fenced replacement; include the exact current text, desired text, and target file.";
  }

  if (/patch-from-not-found/i.test(candidateText)) {
    return "Re-read the target file, then rerun with the exact current text to replace and the desired replacement.";
  }

  if (/patch-ambiguous/i.test(candidateText)) {
    return "Rerun with a more specific replace-from snippet that uniquely identifies the intended occurrence, plus the desired replacement.";
  }

  if (/approval|approve escalation/i.test(candidateText)) {
    return "Rerun with --non-interactive-approval allow-once, or use an interactive shell and approve the request.";
  }

  if (
    /mcp (?:config|server)|unknown mcp server/i.test(candidateText) ||
    /mcp tool .*?(?:not registered|unavailable)/i.test(candidateText)
  ) {
    return "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool.";
  }

  if (codingResult.verification.status === "failed") {
    return "Inspect the verification failure, adjust the requested edit, and rerun.";
  }

  if (
    codingResult.changedFiles.length > 0 &&
    codingResult.verification.status === "not-requested"
  ) {
    return "Ask for an explicit low-risk verification if you want the changed files checked.";
  }

  if (codingResult.failedFiles.length > 0) {
    return "Inspect the failed file operation and rerun with a more explicit target or content.";
  }

  if (
    codingResult.changedFiles.length === 0 &&
    (codingResult.taskKind === "read-file" ||
      codingResult.taskKind === "inspect-files")
  ) {
    return "Use the observed file context to request a specific edit, ask for more lines, or run an explicit verification.";
  }

  if (
    codingResult.changedFiles.length > 0 &&
    codingResult.verification.status === "passed"
  ) {
    return "Review the changed file, then run the project test suite before committing if one exists.";
  }

  return undefined;
}

export function buildTerminalNextSteps(
  terminalDetail: string,
  codingResult?: CodingResultSummary,
): string[] {
  if (isApprovedToolExecutionFailure(codingResult)) {
    return [
      "Tool execution failed after approval; inspect the command output/error.",
      "Fix the command or environment issue, then rerun the command if still needed.",
    ];
  }

  const runCommandBlockContext =
    parseRunCommandAllowlistBlockContext(terminalDetail);
  if (runCommandBlockContext) {
    return [
      "Run-command intent was blocked by the controlled allowlist.",
      `Allowed commands: ${runCommandBlockContext.allowedCommands}`,
      'Rephrase with one allowed command, for example: "Run node --version".',
    ];
  }

  if (terminalDetail.includes("provider-readiness:network")) {
    return [
      "Check network/proxy/firewall reachability to the provider endpoint.",
      "Submit the prompt again after connectivity recovers.",
    ];
  }
  if (terminalDetail.includes("provider-readiness:unsupported-provider")) {
    return [
      "Switch to a supported provider with /connect use openai.",
      "Retry the request.",
    ];
  }
  if (terminalDetail.includes("provider-readiness:missing-config")) {
    return [
      "Configure provider base URL and model via /connect set <provider> <api-key> <base-url> <model>.",
      "Retry the request.",
    ];
  }
  if (terminalDetail.includes("provider-readiness:auth")) {
    return [
      "Check provider API key validity/permissions.",
      "Retry the request.",
    ];
  }
  if (
    terminalDetail.includes("provider-readiness:missing-key") ||
    terminalDetail.includes("OPENAI_API_KEY")
  ) {
    return [
      "Configure credential via /connect set <provider> <api-key> (or export env var).",
      "Retry the request.",
    ];
  }
  if (terminalDetail.includes("Approval denied by user")) {
    return ["Submit the prompt again and approve escalation when requested."];
  }
  if (
    /replacement not safely derivable|edit instruction is ambiguous|fenced replacement content|replace-from\/replace-to|replace-from/i.test(
      terminalDetail,
    )
  ) {
    return [
      "Rerun with an explicit replace-from/to instruction or fenced replacement, including the exact current text, desired text, and target file.",
    ];
  }
  return [
    "Inspect the stop reason and rerun with an explicit command or next action.",
  ];
}

function isApprovedToolExecutionFailure(
  codingResult: CodingResultSummary | undefined,
): boolean {
  if (!codingResult) {
    return false;
  }
  const commandFailed = codingResult.failedFiles.some(
    (entry) => entry.path === "(command)",
  );
  if (!commandFailed) {
    return false;
  }
  if (hasApprovedBashExecutionFailureProvenance(codingResult)) {
    return true;
  }
  return codingResult.evidence.some(
    (entry) =>
      entry === "current-permission-request-tool:bash" ||
      entry.startsWith("current-permission-request-process:"),
  );
}

function hasApprovedBashExecutionFailureProvenance(
  codingResult: CodingResultSummary,
): boolean {
  return (
    codingResult.provenance?.toolExecutions?.some(
      (execution) =>
        execution.toolName === "bash" &&
        execution.kind === "executed-failed" &&
        codingResult.provenance?.approvalDecisions?.some(
          (approval) =>
            approval.taskId === execution.taskId &&
            approval.toolName === execution.toolName &&
            approval.legacyOutcome === "approved",
        ),
    ) ?? false
  );
}
