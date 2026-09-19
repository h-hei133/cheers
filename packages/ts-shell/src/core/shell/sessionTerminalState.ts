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
import {
  buildCodingFailureSummary,
  buildCodingResultNextAction,
  buildCodingSuccessEvidenceLines,
  buildTerminalNextSteps,
  buildVerificationStatusDetail,
  renderContinuationSeedSummary,
} from "./sessionTerminalEvidence.js";

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

export function parseRunCommandAllowlistBlockContext(
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

