import type {
  CodingResultSummary,
  ContinuationReason,
  OrchestrationStatus,
  TerminalReason,
} from "../../orchestration/types.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  SessionContinuitySnapshot,
  SessionManager,
} from "../../session/SessionManager.js";
import type { QueryEvent } from "../query/events.js";
import type { QueryRuntimeStateSeed } from "../query/runtimeState.js";
import { ShellStateMachine } from "./stateMachine.js";

export interface SessionRuntimeDependencies {
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runPrompt: (
    prompt: string,
    signal: AbortSignal,
    runtimeSeed?: QueryRuntimeStateSeed,
    continuityState?: SessionContinuitySnapshot,
  ) => AsyncIterable<QueryEvent>;
}

export class ShellSessionRuntime {
  private readonly deps: SessionRuntimeDependencies;
  private readonly stateMachine = new ShellStateMachine();
  private currentRunController: AbortController | null = null;
  private viewMode: "compact" | "verbose" = "compact";
  private agentMode: "plan" | "build" = "build";

  constructor(deps: SessionRuntimeDependencies) {
    this.deps = deps;
  }

  getState() {
    return this.stateMachine.getState();
  }

  getCurrentRunController(): AbortController | null {
    return this.currentRunController;
  }

  getViewMode(): "compact" | "verbose" {
    return this.viewMode;
  }

  setViewMode(mode: "compact" | "verbose"): void {
    this.viewMode = mode;
  }

  getAgentMode(): "plan" | "build" {
    return this.agentMode;
  }

  setAgentMode(mode: "plan" | "build"): void {
    this.agentMode = mode;
  }

  async executePrompt(
    sessionId: string,
    prompt: string,
    options?: {
      runtimeSeed?: QueryRuntimeStateSeed;
      continuityState?: SessionContinuitySnapshot;
      outputMode?: "interactive" | "print";
    },
  ): Promise<string> {
    this.currentRunController = new AbortController();
    const signal = this.currentRunController.signal;
    this.stateMachine.startRun();
    let finalOutput = "";
    let terminalStatus: OrchestrationStatus = "completed";
    let terminalStopReason: string | undefined;
    let terminalReason: TerminalReason = "completed";
    let terminalClassification: "success" | "stopped" | "error" = "success";
    let lastContinuationReason: ContinuationReason | undefined;
    let terminalCodingResult: CodingResultSummary | undefined;
    let startedRendering = false;
    const printMode = options?.outputMode === "print";
    let enteredQueryPhase = false;
    const eventDigest: RuntimeEventDigest = createRuntimeEventDigest();

    try {
      const continuityBuilder = (
        this.deps.sessionManager as SessionManager & {
          buildPromptContinuitySnapshot?: (
            sessionId: string,
            currentPrompt: string,
          ) => SessionContinuitySnapshot | undefined;
          buildContinuitySnapshot?: (
            sessionId: string,
          ) => SessionContinuitySnapshot;
        }
      ).buildPromptContinuitySnapshot;
      const activeContinuityBuilder = (
        this.deps.sessionManager as SessionManager & {
          buildContinuitySnapshot?: (
            sessionId: string,
          ) => SessionContinuitySnapshot;
        }
      ).buildContinuitySnapshot;
      const outputMode = options?.outputMode ?? "interactive";
      let continuityState = options?.continuityState;
      if (!continuityState) {
        continuityState =
          !options?.runtimeSeed && outputMode === "interactive"
            ? typeof activeContinuityBuilder === "function"
              ? activeContinuityBuilder.call(
                  this.deps.sessionManager,
                  sessionId,
                )
              : typeof continuityBuilder === "function"
                ? continuityBuilder.call(
                    this.deps.sessionManager,
                    sessionId,
                    prompt,
                  )
                : undefined
            : !options?.runtimeSeed && typeof continuityBuilder === "function"
              ? continuityBuilder.call(
                  this.deps.sessionManager,
                  sessionId,
                  prompt,
                )
              : undefined;
      }

      if (!options?.runtimeSeed) {
        this.deps.sessionManager.persistUserPromptBarrier(sessionId, prompt);
      }

      let sawTerminalEvent = false;

      if (
        options?.runtimeSeed &&
        options.runtimeSeed.recoveryBoundary !== "fresh-entry"
      ) {
        this.deps.sessionManager.markRecoveryReentry(
          sessionId,
          options.runtimeSeed.recoveryBoundary,
        );
        enteredQueryPhase =
          options.runtimeSeed.recoveryBoundary === "mid-turn-reentry";
      }

      for await (const event of this.deps.runPrompt(
        prompt,
        signal,
        options?.runtimeSeed,
        continuityState,
      )) {
        if (!enteredQueryPhase) {
          enteredQueryPhase = true;
          this.deps.sessionManager.markTurnActive(sessionId);
        }
        this.deps.sessionManager.appendQueryEvent(sessionId, event);
        updateRuntimeEventDigest(eventDigest, event);
        switch (event.type) {
          case "mcp.snapshot":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(
                `\n[MCP] clients=${event.clients} tools=${event.tools}`,
              );
            }
            break;
          case "tool.started":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(`\n[tool:start] ${event.toolName}`);
            }
            break;
          case "approval.requested":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(
                `\n[approval] requested for ${event.toolName}`,
              );
            }
            break;
          case "approval.resolved":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(
                `\n[approval] ${event.toolName} ${event.outcome}`,
              );
            }
            break;
          case "tool.result":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(
                `\n[tool:result] ${event.toolName} success=${event.success}`,
              );
            }
            break;
          case "query.retrying":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(
                `\n[query:retry] role=${event.role} turn=${event.turn} attempt=${event.attempt} reason=${event.reason}`,
              );
            } else {
              renderCompactRetryNotice(this.deps.renderer, eventDigest);
            }
            break;
          case "message.delta":
            if (printMode) {
              break;
            }
            if (this.viewMode !== "verbose" && event.role === "planner") {
              break;
            }
            if (!startedRendering) {
              this.deps.renderer.renderLine("\nAssistant:");
              startedRendering = true;
            }
            this.deps.renderer.renderChunk(event.delta);
            break;
          case "lifecycle.cancelled":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(`\n[cancelled] ${event.reason}`);
            } else {
              this.deps.renderer.renderLine(
                "\nCurrent request was cancelled before completion.",
              );
            }
            break;
          case "lifecycle.error":
            if (printMode) {
              break;
            }
            if (this.viewMode === "verbose") {
              this.deps.renderer.renderLine(`\n[error] ${event.error}`);
            } else {
              this.deps.renderer.renderLine(
                "\nRuntime error occurred while processing this request.",
              );
            }
            break;
          case "query.completed":
            sawTerminalEvent = true;
            finalOutput = event.result.finalOutput;
            terminalStatus = event.result.status;
            terminalStopReason = event.result.stopReason;
            terminalReason = event.result.terminalReason;
            terminalClassification = event.result.terminalClassification;
            lastContinuationReason = event.result.lastContinuationReason;
            terminalCodingResult = event.result.codingResult;
            break;
          case "query.failed":
            sawTerminalEvent = true;
            throw new Error(event.error);
          default:
            break;
        }
      }

      if (printMode) {
        if (terminalStatus === "completed") {
          if (finalOutput.length > 0) {
            this.deps.renderer.renderLine(finalOutput);
          }
        } else {
          this.deps.renderer.renderLine(terminalStopReason ?? terminalStatus);
        }
        renderTerminalResultBlock(this.deps.renderer, {
          status: terminalStatus,
          terminalClassification,
          terminalStopReason,
          terminalReason,
          codingResult: terminalCodingResult,
          mode: "minimal",
        });
        renderCodingResultContract(this.deps.renderer, terminalCodingResult, {
          mode: "minimal",
        });
        if (terminalStatus !== "completed") {
          const terminalDetail = terminalStopReason ?? terminalStatus;
          const nextSteps = buildTerminalNextSteps(terminalDetail);
          this.deps.renderer.renderLine("Next steps");
          for (const step of nextSteps) {
            this.deps.renderer.renderLine(`- ${step}`);
          }
          this.deps.renderer.renderLine("");
        }
        renderExecutionSummaryBlock(this.deps.renderer, eventDigest, "minimal");
      } else {
        if (
          !startedRendering &&
          finalOutput.length > 0 &&
          terminalStatus === "completed"
        ) {
          this.deps.renderer.renderLine("\nAssistant:");
          this.deps.renderer.renderLine(finalOutput);
        }

        if (startedRendering && terminalStatus === "completed") {
          this.deps.renderer.renderLine("");
        }

        renderExecutionSummaryBlock(
          this.deps.renderer,
          eventDigest,
          this.viewMode === "verbose" ? "verbose" : "minimal",
        );

        renderTerminalResultBlock(this.deps.renderer, {
          status: terminalStatus,
          terminalClassification,
          terminalStopReason,
          terminalReason,
          codingResult: terminalCodingResult,
          mode: this.viewMode === "verbose" ? "verbose" : "minimal",
        });
        renderCodingResultContract(this.deps.renderer, terminalCodingResult, {
          mode: this.viewMode === "verbose" ? "verbose" : "minimal",
        });

        if (terminalStatus !== "completed") {
          const terminalDetail = terminalStopReason ?? terminalStatus;
          const nextSteps = buildTerminalNextSteps(terminalDetail);
          this.deps.renderer.renderLine("Next steps");
          for (const step of nextSteps) {
            this.deps.renderer.renderLine(`- ${step}`);
          }
          this.deps.renderer.renderLine("");
        }
      }

      if (finalOutput.length > 0) {
        this.deps.sessionManager.addTurn(sessionId, {
          role: "assistant",
          content: finalOutput,
        });
      }

      if (!sawTerminalEvent) {
        throw new Error("Query runtime ended without a terminal event");
      }

      if (terminalStatus === "completed") {
        this.deps.sessionManager.saveCompleted(sessionId, {
          terminalReason,
          terminalClassification,
          lastContinuationReason,
        });
      } else {
        this.deps.sessionManager.saveError(
          sessionId,
          terminalStopReason ?? terminalStatus,
          {
            terminalReason,
            terminalClassification,
            lastContinuationReason,
          },
        );
      }
      this.stateMachine.completeRun();
      this.currentRunController = null;
      return finalOutput;
    } catch (error) {
      if (signal.aborted) {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: "lifecycle.cancelled",
          reason: "AbortSignal triggered during shell session runtime",
        });
        this.deps.sessionManager.saveInterrupted(
          sessionId,
          enteredQueryPhase ? "turn" : "prompt",
        );
        this.stateMachine.interruptRun();
      } else {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: "lifecycle.error",
          error: error instanceof Error ? error.message : String(error),
        });
        this.deps.sessionManager.saveError(
          sessionId,
          error instanceof Error ? error.message : String(error),
          {
            terminalReason: "stopped_error",
            terminalClassification: "error",
            lastContinuationReason,
          },
        );
        this.stateMachine.failRun();
      }
      this.currentRunController = null;
      throw error;
    }
  }

  cancelCurrentRun(): void {
    this.currentRunController?.abort();
    this.stateMachine.interruptRun();
  }

  terminate(sessionId: string): void {
    this.stateMachine.terminate();
    this.deps.sessionManager.saveTerminated(sessionId);
  }
}

function parseRunCommandAllowlistBlockContext(
  terminalDetail: string,
): { allowedCommands: string } | null {
  if (
    !terminalDetail.includes(
      "Run-command intent is not allowed in the MVP allowlist",
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

interface RuntimeEventDigest {
  mcpSnapshots: number;
  mcpClients: number;
  mcpTools: number;
  retries: number;
  toolsStarted: number;
  toolNames: string[];
  toolsFailed: number;
  approvalsRequested: number;
  approvalsApproved: number;
  approvalsDenied: number;
  retryNoticeShown: boolean;
}

function createRuntimeEventDigest(): RuntimeEventDigest {
  return {
    mcpSnapshots: 0,
    mcpClients: 0,
    mcpTools: 0,
    retries: 0,
    toolsStarted: 0,
    toolNames: [],
    toolsFailed: 0,
    approvalsRequested: 0,
    approvalsApproved: 0,
    approvalsDenied: 0,
    retryNoticeShown: false,
  };
}

function updateRuntimeEventDigest(
  digest: RuntimeEventDigest,
  event: QueryEvent,
): void {
  switch (event.type) {
    case "mcp.snapshot":
      digest.mcpSnapshots += 1;
      digest.mcpClients = event.clients;
      digest.mcpTools = event.tools;
      break;
    case "query.retrying":
      digest.retries += 1;
      break;
    case "tool.started":
      digest.toolsStarted += 1;
      if (!digest.toolNames.includes(event.toolName)) {
        digest.toolNames.push(event.toolName);
      }
      break;
    case "tool.result":
      if (!event.success) {
        digest.toolsFailed += 1;
      }
      break;
    case "approval.requested":
      digest.approvalsRequested += 1;
      break;
    case "approval.resolved":
      if (event.outcome === "approved") {
        digest.approvalsApproved += 1;
      } else {
        digest.approvalsDenied += 1;
      }
      break;
    default:
      break;
  }
}

function renderCompactRetryNotice(
  renderer: StreamingRenderer,
  digest: RuntimeEventDigest,
): void {
  if (digest.retryNoticeShown) {
    return;
  }
  digest.retryNoticeShown = true;
  renderer.renderLine("\nWorking through a temporary provider retry...");
}

function renderExecutionSummaryBlock(
  renderer: StreamingRenderer,
  digest: RuntimeEventDigest,
  mode: "minimal" | "verbose",
): void {
  const summaryLines: string[] = [];
  if (digest.toolsStarted > 0) {
    const toolLabel =
      digest.toolNames.length > 0
        ? digest.toolNames.slice(0, 3).join(", ")
        : "tooling";
    summaryLines.push(
      digest.toolsFailed > 0
        ? `Actions: ${toolLabel} (${digest.toolsStarted} run, ${digest.toolsFailed} failed)`
        : `Actions: ${toolLabel} (${digest.toolsStarted} run)`,
    );
  }
  if (digest.approvalsRequested > 0) {
    summaryLines.push(
      `Approvals: ${digest.approvalsApproved}/${digest.approvalsRequested} approved`,
    );
  }
  if (digest.retries > 0) {
    summaryLines.push(`Provider retries: ${digest.retries}`);
  }
  if (digest.mcpSnapshots > 0) {
    summaryLines.push(
      `MCP: clients=${digest.mcpClients}, tools=${digest.mcpTools}`,
    );
  }

  if (summaryLines.length === 0) {
    return;
  }

  renderer.renderLine(
    mode === "verbose" ? "\nExecution trace summary" : "\nExecution summary",
  );
  for (const line of summaryLines) {
    renderer.renderLine(`- ${line}`);
  }
  renderer.renderLine("");
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
    const actionableBlocker = deriveActionableBlockerContract({
      stopReason: input.terminalStopReason,
      codingResult: input.codingResult,
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
  const actionableBlocker = deriveActionableBlockerContract({
    stopReason: input.terminalStopReason,
    codingResult: input.codingResult,
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

type ActionableBlockerKind =
  | "ambiguous-target"
  | "patch-from-not-found"
  | "patch-target-missing"
  | "verification-failed"
  | "command-not-allowlisted";

function deriveActionableBlockerContract(input: {
  stopReason?: string;
  codingResult?: CodingResultSummary;
}):
  | { kind: ActionableBlockerKind; reason: string; doNext: string }
  | undefined {
  const evidenceKind = findActionableBlockerKindInEvidence(
    input.codingResult?.evidence,
  );
  const reason =
    input.stopReason?.trim() ||
    input.codingResult?.verification.reason?.trim() ||
    input.codingResult?.failedFiles.find(
      (entry) => entry.reason.trim().length > 0,
    )?.reason ||
    input.codingResult?.taskSatisfaction.reasons.find(
      (entry) => entry.trim().length > 0,
    );

  if (!reason) {
    return undefined;
  }

  const kind =
    evidenceKind ??
    classifyActionableBlockerKind(
      reason,
      input.codingResult?.verification.status === "failed",
    );
  if (!kind) {
    return undefined;
  }

  return {
    kind,
    reason,
    doNext: actionableBlockerNextAction(kind),
  };
}

function findActionableBlockerKindInEvidence(
  evidence: readonly string[] | undefined,
): ActionableBlockerKind | undefined {
  if (!evidence) {
    return undefined;
  }
  const marker = evidence
    .find((entry) => entry.startsWith("actionable-blocker-kind:"))
    ?.slice("actionable-blocker-kind:".length)
    .trim();
  if (
    marker === "ambiguous-target" ||
    marker === "patch-from-not-found" ||
    marker === "patch-target-missing" ||
    marker === "verification-failed" ||
    marker === "command-not-allowlisted"
  ) {
    return marker;
  }
  return undefined;
}

function classifyActionableBlockerKind(
  reason: string,
  verificationFailed: boolean,
): ActionableBlockerKind | undefined {
  const normalizedReason = reason.toLowerCase();
  if (verificationFailed || normalizedReason.includes("verification failed")) {
    return "verification-failed";
  }
  if (normalizedReason.includes("not allowed in the mvp allowlist")) {
    return "command-not-allowlisted";
  }
  if (
    normalizedReason.includes("patch-target-missing") ||
    normalizedReason.includes("edit-target-missing")
  ) {
    return "patch-target-missing";
  }
  if (
    normalizedReason.includes("patch-from-not-found") ||
    normalizedReason.includes("replace source text not found")
  ) {
    return "patch-from-not-found";
  }
  if (
    normalizedReason.includes("patch-ambiguous") ||
    normalizedReason.includes("target-not-unique") ||
    normalizedReason.includes("relocation is ambiguous") ||
    normalizedReason.includes("follow-up is ambiguous") ||
    (normalizedReason.includes("ambiguous") &&
      !normalizedReason.includes("allowlist"))
  ) {
    return "ambiguous-target";
  }
  return undefined;
}

function actionableBlockerNextAction(kind: ActionableBlockerKind): string {
  switch (kind) {
    case "command-not-allowlisted":
      return "Rephrase the request with an allowlisted command: node --version, npm test -- --help, or npm run build -- --help.";
    case "patch-from-not-found":
      return "Provide the exact current source text from the target file, then rerun the patch.";
    case "patch-target-missing":
      return "Create or confirm the target file path first, then rerun the patch.";
    case "ambiguous-target":
      return "Specify one exact target file/path (and exact from/to text if editing), then rerun.";
    case "verification-failed":
      return "Fix the verification failure, then rerun the verification step.";
    default:
      return "Clarify the blocking condition and rerun.";
  }
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
    for (const line of buildCodingSuccessEvidenceLines(codingResult)) {
      renderer.renderLine(line);
    }
    const failureSummary = buildCodingFailureSummary(codingResult);
    if (failureSummary) {
      renderer.renderLine(`- Failure reason: ${failureSummary}`);
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

function buildRepairContextEvidenceLines(
  evidence: readonly string[],
): string[] {
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

function buildTerminalNextSteps(terminalDetail: string): string[] {
  const runCommandBlockContext =
    parseRunCommandAllowlistBlockContext(terminalDetail);
  if (runCommandBlockContext) {
    return [
      "Run-command intent was blocked by the MVP allowlist.",
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
