import type {
  CodingResultSummary,
  ContinuationReason,
  OrchestrationStatus,
  TerminalReason,
} from "../../result/types.js";
import type { LoopTrajectoryProjection } from "../../runtime/loop/trajectory.js";
import type { ProductLoopAdapterProjection } from "../../runtime/loop/adapter.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionContinuitySnapshot } from "../../session/SessionManager.js";
import { projectSessionResultParity } from "../../session/sessionResultParity.js";
import type { QueryEvent } from "../query/runtime/events.js";
import type { RuntimeEventDigest } from "./sessionEventSurface.js";
import { projectCliSessionProductSurface } from "./cliSessionProductSurface.js";
import { renderExecutionSummaryBlock } from "./sessionEventSurface.js";
import { selectPrintTerminalOutput } from "./sessionPrintOutputProjection.js";
import { formatExplicitRestoreSummaryLines } from "./restoreSurfaceSummary.js";

export interface SessionTerminalState {
  finalOutput: string;
  terminalStatus: OrchestrationStatus;
  terminalStopReason?: string;
  terminalReason: TerminalReason;
  terminalClassification: "success" | "stopped" | "error";
  lastContinuationReason?: ContinuationReason;
  terminalCodingResult?: CodingResultSummary;
  terminalLoopTrajectory?: LoopTrajectoryProjection;
  terminalProductLoopAdapter?: ProductLoopAdapterProjection;
  terminalNotes: readonly string[];
  sawTerminalEvent: boolean;
}

export function createSessionTerminalState(): SessionTerminalState {
  return {
    finalOutput: "",
    terminalStatus: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    terminalNotes: [],
    sawTerminalEvent: false,
  };
}

export function applyTerminalQueryEvent(
  state: SessionTerminalState,
  event: QueryEvent,
): void {
  if (event.type !== "query.completed") {
    return;
  }
  state.sawTerminalEvent = true;
  state.finalOutput = event.result.finalOutput;
  state.terminalStatus = event.result.status;
  state.terminalStopReason = event.result.stopReason;
  state.terminalReason = event.result.terminalReason;
  state.terminalClassification = event.result.terminalClassification;
  state.lastContinuationReason = event.result.lastContinuationReason;
  state.terminalCodingResult = event.result.codingResult;
  state.terminalLoopTrajectory = event.result.loopTrajectory as LoopTrajectoryProjection | undefined;
  state.terminalProductLoopAdapter = event.result.productLoopAdapter as ProductLoopAdapterProjection | undefined;
  state.terminalNotes = event.result.sharedContext.notes;
}

export function renderSessionTerminalSurface(input: {
  renderer: StreamingRenderer;
  terminalState: SessionTerminalState;
  eventDigest: RuntimeEventDigest;
  printMode: boolean;
  viewMode: "compact" | "verbose";
  startedRendering: boolean;
  continuityState?: SessionContinuitySnapshot;
}): void {
  const terminalState = input.terminalState;
  const renderMode = input.viewMode === "verbose" ? "verbose" : "minimal";

  if (input.printMode) {
    const printOutput = selectPrintTerminalOutput({
      finalOutput: terminalState.finalOutput,
      terminalStatus: terminalState.terminalStatus,
      terminalStopReason: terminalState.terminalStopReason,
      codingResult: terminalState.terminalCodingResult,
    });
    if (printOutput) {
      input.renderer.renderLine(printOutput);
    }
    renderTerminalResultBlock(input.renderer, {
      status: terminalState.terminalStatus,
      terminalClassification: terminalState.terminalClassification,
      terminalStopReason: terminalState.terminalStopReason,
      terminalReason: terminalState.terminalReason,
      codingResult: terminalState.terminalCodingResult,
      mode: "minimal",
    });
    renderCodingResultContract(input.renderer, terminalState.terminalCodingResult, {
      mode: "minimal",
    });
    renderProductExperienceSurface(input.renderer, {
      status: terminalState.terminalStatus,
      terminalClassification: terminalState.terminalClassification,
      terminalReason: terminalState.terminalReason,
      terminalStopReason: terminalState.terminalStopReason,
      codingResult: terminalState.terminalCodingResult,
      loopTrajectory: terminalState.terminalLoopTrajectory,
      productLoopAdapter: terminalState.terminalProductLoopAdapter,
    });
    renderContinuationSeedSummary(input.renderer, {
      codingResult: terminalState.terminalCodingResult,
      notes: terminalState.terminalNotes,
      handoffSummary: input.continuityState?.lastActionHandoffSummary
        ? input.continuityState.lastActionHandoffSummary
        : undefined,
      seedInfluenceHandoffSummary: input.continuityState
        ?.lastSeedInfluenceHandoffSummary
        ? input.continuityState.lastSeedInfluenceHandoffSummary
        : undefined,
      failureHandoffDiagnostic: input.continuityState
        ?.lastFailureHandoffDiagnostic
        ? input.continuityState.lastFailureHandoffDiagnostic
        : undefined,
      successHandoffDiagnostic: input.continuityState
        ?.lastSuccessHandoffDiagnostic
        ? input.continuityState.lastSuccessHandoffDiagnostic
        : undefined,
    });
    renderTerminalNextSteps(input.renderer, terminalState);
    renderExecutionSummaryBlock(input.renderer, input.eventDigest, "minimal");
    return;
  }

  if (
    !input.startedRendering &&
    terminalState.finalOutput.length > 0 &&
    terminalState.terminalStatus === "completed"
  ) {
    input.renderer.renderLine("\nAssistant:");
    input.renderer.renderLine(terminalState.finalOutput);
  }

  if (input.startedRendering && terminalState.terminalStatus === "completed") {
    input.renderer.renderLine("");
  }

  renderExecutionSummaryBlock(input.renderer, input.eventDigest, renderMode);

  renderTerminalResultBlock(input.renderer, {
    status: terminalState.terminalStatus,
    terminalClassification: terminalState.terminalClassification,
    terminalStopReason: terminalState.terminalStopReason,
    terminalReason: terminalState.terminalReason,
    codingResult: terminalState.terminalCodingResult,
    mode: renderMode,
  });
  renderCodingResultContract(input.renderer, terminalState.terminalCodingResult, {
    mode: renderMode,
  });
  renderProductExperienceSurface(input.renderer, {
    status: terminalState.terminalStatus,
    terminalClassification: terminalState.terminalClassification,
    terminalReason: terminalState.terminalReason,
    terminalStopReason: terminalState.terminalStopReason,
    codingResult: terminalState.terminalCodingResult,
    loopTrajectory: terminalState.terminalLoopTrajectory,
    productLoopAdapter: terminalState.terminalProductLoopAdapter,
  });
  if (input.viewMode === "verbose") {
    renderContinuationSeedSummary(input.renderer, {
      codingResult: terminalState.terminalCodingResult,
      notes: terminalState.terminalNotes,
      handoffSummary: input.continuityState?.lastActionHandoffSummary
        ? input.continuityState.lastActionHandoffSummary
        : undefined,
      seedInfluenceHandoffSummary: input.continuityState
        ?.lastSeedInfluenceHandoffSummary
        ? input.continuityState.lastSeedInfluenceHandoffSummary
        : undefined,
      failureHandoffDiagnostic: input.continuityState?.lastFailureHandoffDiagnostic
        ? input.continuityState.lastFailureHandoffDiagnostic
        : undefined,
      successHandoffDiagnostic: input.continuityState?.lastSuccessHandoffDiagnostic
        ? input.continuityState.lastSuccessHandoffDiagnostic
        : undefined,
    });
  }
  renderTerminalNextSteps(input.renderer, terminalState);
}

function renderTerminalNextSteps(
  renderer: StreamingRenderer,
  terminalState: SessionTerminalState,
): void {
  if (terminalState.terminalStatus === "completed") {
    return;
  }
  const terminalDetail =
    terminalState.terminalStopReason ?? terminalState.terminalStatus;
  const nextSteps = buildTerminalNextSteps(
    terminalDetail,
    terminalState.terminalCodingResult,
  );
  renderer.renderLine("Next steps");
  for (const step of nextSteps) {
    renderer.renderLine(`- ${step}`);
  }
  renderer.renderLine("");
}

function parseRunCommandAllowlistBlockContext(
  terminalDetail: string,
): { allowedCommands: string } | null {
  if (
    !terminalDetail.includes(
      "Run-command intent is not allowed in the controlled allowlist",
    )
  ) {
    return null;
  }

  const allowedMatch = terminalDetail.match(
    /Allowed commands:\s*(.+?)(?:\s+Please rephrase|$)/,
  );

  return {
    allowedCommands: allowedMatch?.[1]?.trim() ?? "node --version",
  };
}

function renderTerminalResultBlock(
  renderer: StreamingRenderer,
  input: {
    status: OrchestrationStatus;
    terminalClassification: "success" | "stopped" | "error";
    terminalStopReason?: string;
    terminalReason: TerminalReason;
    codingResult?: CodingResultSummary;
    mode: "minimal" | "verbose";
  },
): void {
  const statusLabel =
    input.terminalClassification === "success"
      ? "success"
      : input.terminalClassification === "stopped"
        ? "stopped"
        : "error";
  if (input.mode === "minimal") {
    const detail =
      input.status === "completed"
        ? "completed"
        : (input.terminalStopReason ?? input.status);
    const actionableBlocker = deriveSessionTerminalBlockerDetail({
      stopReason: input.terminalStopReason,
      codingResult: input.codingResult,
      terminalClassification: input.terminalClassification,
    });
    renderer.renderLine("Result");
    renderer.renderLine(`- Outcome: ${statusLabel}`);
    renderer.renderLine(`- Detail: ${detail}`);
    if (actionableBlocker) {
      renderer.renderLine(`- BlockerKind: ${actionableBlocker.kind}`);
      renderer.renderLine(`- Reason: ${actionableBlocker.reason}`);
      renderer.renderLine(`- DoNext: ${actionableBlocker.doNext}`);
    }
    renderer.renderLine("");
    return;
  }
  const actionableBlocker = deriveSessionTerminalBlockerDetail({
    stopReason: input.terminalStopReason,
    codingResult: input.codingResult,
    terminalClassification: input.terminalClassification,
  });
  renderer.renderLine("Final result");
  renderer.renderLine(`- Classification: ${statusLabel}`);
  renderer.renderLine(`- Terminal reason: ${input.terminalReason}`);
  if (input.status !== "completed") {
    renderer.renderLine(
      `- Stop detail: ${input.terminalStopReason ?? input.status}`,
    );
  }
  if (actionableBlocker) {
    renderer.renderLine(`- Blocker kind: ${actionableBlocker.kind}`);
    renderer.renderLine(`- Blocker reason: ${actionableBlocker.reason}`);
    renderer.renderLine(`- Blocker do next: ${actionableBlocker.doNext}`);
  }
  renderer.renderLine("");
}

function deriveSessionTerminalBlockerDetail(input: {
  stopReason?: string;
  codingResult?: CodingResultSummary;
  terminalClassification: "success" | "stopped" | "error";
}) {
  const projection = projectSessionResultParity({
    terminalClassification: input.terminalClassification,
    stopReason: input.stopReason,
    codingResult: input.codingResult,
  });
  if (!projection.blockerKind || !projection.reason || !projection.doNext) {
    return undefined;
  }
  return {
    kind: projection.blockerKind,
    reason: projection.reason,
    doNext: projection.doNext,
  };
}

function renderCodingResultContract(
  renderer: StreamingRenderer,
  codingResult: CodingResultSummary | undefined,
  options: { mode: "minimal" | "verbose" },
): void {
  if (!codingResult) {
    return;
  }

  if (options.mode === "minimal") {
    const verificationStatus =
      codingResult.verification.status === "passed"
        ? "passed"
        : codingResult.verification.status === "failed"
          ? "failed"
          : codingResult.verification.status === "blocked"
            ? "blocked"
            : codingResult.verification.status === "skipped"
              ? "skipped"
              : "not-requested";
    const changedFilesSummary =
      codingResult.changedFiles.length > 0
        ? `${codingResult.changedFiles.length} file(s)`
        : "none";
    renderer.renderLine("Action result");
    renderer.renderLine(`- Task: ${codingResult.taskKind}`);
    renderer.renderLine(`- Changed: ${changedFilesSummary}`);
    if (codingResult.failedFiles.length > 0) {
      renderer.renderLine(
        `- Failed files: ${codingResult.failedFiles.map((entry) => `${entry.path} (${entry.reason})`).join("; ")}`,
      );
    }
    for (const line of buildCodingSuccessEvidenceLines(codingResult)) {
      renderer.renderLine(line);
    }
    const failureSummary = buildCodingFailureSummary(codingResult);
    if (failureSummary) {
      renderer.renderLine(`- Failure reason: ${failureSummary}`);
    }
    for (const line of formatExplicitRestoreSummaryLines(codingResult)) {
      renderer.renderLine(line);
    }
    renderer.renderLine(`- Verification: ${verificationStatus}`);
    const verificationDetail = buildVerificationStatusDetail(codingResult);
    if (verificationDetail) {
      renderer.renderLine(`- Verification detail: ${verificationDetail}`);
    }
    const nextAction =
      codingResult.verification.nextAction ??
      buildCodingResultNextAction(codingResult);
    if (nextAction) {
      renderer.renderLine(`- Next action: ${nextAction}`);
    }
    const note = codingResult.taskSatisfaction.reasons[0];
    if (note && (!failureSummary || !failureSummary.includes(note))) {
      renderer.renderLine(`- Note: ${note}`);
    }
    renderer.renderLine("");
    return;
  }

  renderer.renderLine("Coding result");
  renderer.renderLine(`- Task kind: ${codingResult.taskKind}`);
  if (codingResult.changedFiles.length > 0) {
    renderer.renderLine(
      `- Changed files: ${codingResult.changedFiles.join(", ")}`,
    );
  } else {
    renderer.renderLine("- Changed files: none");
  }
  if (codingResult.failedFiles.length > 0) {
    renderer.renderLine(
      `- Failed files: ${codingResult.failedFiles.map((entry) => `${entry.path} (${entry.reason})`).join("; ")}`,
    );
  }
  if (codingResult.verifiedFiles.length > 0) {
    renderer.renderLine(
      `- Verified files: ${codingResult.verifiedFiles.join(", ")}`,
    );
  }
  if (codingResult.unverifiedFiles.length > 0) {
    renderer.renderLine(
      `- Unverified files: ${codingResult.unverifiedFiles.map((entry) => `${entry.path} (${entry.reason})`).join("; ")}`,
    );
  }
  for (const line of formatExplicitRestoreSummaryLines(codingResult)) {
    renderer.renderLine(line);
  }
  if ((codingResult.patches?.length ?? 0) > 0) {
    renderer.renderLine(
      `- Patch results: ${codingResult.patches
        ?.map((record) =>
          record.status === "applied"
            ? `${record.path} [${record.operation}] applied (changed=${record.changedLines ?? 0}, added=${record.addedLines ?? 0}, removed=${record.removedLines ?? 0})`
            : `${record.path} [${record.operation}] failed (${record.failureCode ?? "unknown"}: ${record.reason ?? "unknown"})`,
        )
        .join("; ")}`,
    );
  }
  if (codingResult.diagnosis) {
    renderer.renderLine(
      `- Diagnosis disposition: ${codingResult.diagnosis.disposition}`,
    );
    renderer.renderLine(
      `- Diagnosis evidence files: ${codingResult.diagnosis.evidenceFiles.length > 0 ? codingResult.diagnosis.evidenceFiles.join(", ") : "none"}`,
    );
    renderer.renderLine(
      `- Diagnosis candidates: ${codingResult.diagnosis.candidateFiles.length > 0 ? codingResult.diagnosis.candidateFiles.join(", ") : "none"}`,
    );
    if (codingResult.diagnosis.evidenceLinks.length > 0) {
      renderer.renderLine(
        `- Diagnosis evidence chain: ${codingResult.diagnosis.evidenceLinks
          .slice(0, 2)
          .map((link) => `${link.from} -> ${link.to} (${link.relation})`)
          .join(" | ")}`,
      );
    }
    renderer.renderLine(`- Diagnosis note: ${codingResult.diagnosis.reason}`);
  }

  const verificationStatus =
    codingResult.verification.status === "passed"
      ? "passed"
      : codingResult.verification.status === "failed"
        ? "failed"
        : codingResult.verification.status === "blocked"
          ? "blocked"
          : codingResult.verification.status === "skipped"
            ? "skipped"
            : "not-requested";
  renderer.renderLine(`- Verification: ${verificationStatus}`);
  if (codingResult.verification.command) {
    renderer.renderLine(
      `- Verify command: ${codingResult.verification.command}`,
    );
  }
  if (codingResult.verification.selectionScope) {
    renderer.renderLine(
      `- Verify scope: ${codingResult.verification.selectionScope}`,
    );
  }
  if (codingResult.verification.selectionSource) {
    renderer.renderLine(
      `- Verify selection: ${codingResult.verification.selectionSource}`,
    );
  }
  if (codingResult.verification.reason) {
    renderer.renderLine(`- Verify note: ${codingResult.verification.reason}`);
  }
  if (codingResult.verification.blockerKind) {
    renderer.renderLine(
      `- Verify blocker kind: ${codingResult.verification.blockerKind}`,
    );
  }
  if (codingResult.verification.nextAction) {
    renderer.renderLine(
      `- Verify next action: ${codingResult.verification.nextAction}`,
    );
  }
  renderer.renderLine(
    `- Repair status: ${codingResult.repair.status} (attempts=${codingResult.repair.attempts})`,
  );
  renderer.renderLine(
    `- Continuation: ${codingResult.continuation.status} (attempts=${codingResult.continuation.attempts})`,
  );
  if (codingResult.continuation.evidence.length > 0) {
    renderer.renderLine(
      `- Continuation evidence: ${codingResult.continuation.evidence.join(" | ")}`,
    );
  }
  if (codingResult.repair.recoveredItems.length > 0) {
    renderer.renderLine(
      `- Recovered items: ${codingResult.repair.recoveredItems.join(", ")}`,
    );
  }
  if (codingResult.repair.failedItems.length > 0) {
    renderer.renderLine(
      `- Repair failed items: ${codingResult.repair.failedItems.join(", ")}`,
    );
  }
  if (codingResult.repair.notes.length > 0) {
    renderer.renderLine(
      `- Repair notes: ${codingResult.repair.notes.join(" | ")}`,
    );
  }
  renderer.renderLine(
    `- Change set (git-aware): ${codingResult.changeSet.gitAware ? "yes" : "no"}`,
  );
  if (codingResult.changeSet.gitAware) {
    renderer.renderLine(
      `- Attempted files: ${codingResult.changeSet.attemptedFiles.length > 0 ? codingResult.changeSet.attemptedFiles.join(", ") : "none"}`,
    );
    renderer.renderLine(
      `- Diff-grounded changed files: ${codingResult.changeSet.changedFiles.length > 0 ? codingResult.changeSet.changedFiles.join(", ") : "none"}`,
    );
    if (codingResult.changeSet.unchangedAttemptedFiles.length > 0) {
      renderer.renderLine(
        `- Unchanged attempted files: ${codingResult.changeSet.unchangedAttemptedFiles.join(", ")}`,
      );
    }
    if (codingResult.changeSet.preExistingDirtyFiles.length > 0) {
      renderer.renderLine(
        `- Pre-existing dirty files: ${codingResult.changeSet.preExistingDirtyFiles.join(", ")}`,
      );
    }
  }
  renderer.renderLine(
    `- Task satisfaction: ${codingResult.taskSatisfaction.verdict}`,
  );
  if (codingResult.taskSatisfaction.reasons.length > 0) {
    renderer.renderLine(
      `- Task satisfaction notes: ${codingResult.taskSatisfaction.reasons.join(" | ")}`,
    );
  }
  if (codingResult.failureBoundary) {
    renderer.renderLine(`- Failure boundary: ${codingResult.failureBoundary}`);
  }
  if (codingResult.evidence.length > 0) {
    renderer.renderLine(`- Evidence: ${codingResult.evidence.join(" | ")}`);
  }
  renderer.renderLine("");
}

function renderProductExperienceSurface(
  renderer: StreamingRenderer,
  input: {
    status: OrchestrationStatus;
    terminalClassification: "success" | "stopped" | "error";
    terminalReason: TerminalReason;
    terminalStopReason?: string;
    codingResult?: CodingResultSummary;
    loopTrajectory?: LoopTrajectoryProjection;
    productLoopAdapter?: ProductLoopAdapterProjection;
  },
): void {
  const surface = projectCliSessionProductSurface({
    status: input.status,
    terminalClassification: input.terminalClassification,
    terminalReason: input.terminalReason,
    stopReason: input.terminalStopReason,
    codingResult: input.codingResult,
    loopTrajectory: input.loopTrajectory,
    productLoopAdapter: input.productLoopAdapter,
  });
  if (!surface) {
    return;
  }
  for (const line of surface.lines) {
    renderer.renderLine(line);
  }
}

function renderContinuationSeedSummary(
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

function buildCodingSuccessEvidenceLines(
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

function buildCodingFailureSummary(
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

function buildVerificationStatusDetail(
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

function buildCodingResultNextAction(
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

function buildTerminalNextSteps(
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
