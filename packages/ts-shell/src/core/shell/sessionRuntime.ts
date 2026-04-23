import type {
  ContinuationReason,
  CodingResultSummary,
  OrchestrationStatus,
  TerminalReason,
} from "../../orchestration/types.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { SessionContinuitySnapshot } from "../../session/SessionManager.js";
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
              ? activeContinuityBuilder.call(this.deps.sessionManager, sessionId)
              : typeof continuityBuilder === "function"
                ? continuityBuilder.call(this.deps.sessionManager, sessionId, prompt)
                : undefined
            : !options?.runtimeSeed && typeof continuityBuilder === "function"
              ? continuityBuilder.call(this.deps.sessionManager, sessionId, prompt)
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
          this.deps.renderer.renderLine(
            terminalStopReason ?? terminalStatus,
          );
        }
        renderTerminalResultBlock(this.deps.renderer, {
          status: terminalStatus,
          terminalClassification,
          terminalStopReason,
          terminalReason,
          mode: "minimal",
        });
        renderCodingResultContract(this.deps.renderer, terminalCodingResult, {
          mode: "minimal",
        });
      } else {
        if (!startedRendering && finalOutput.length > 0 && terminalStatus === "completed") {
          this.deps.renderer.renderLine("\nAssistant:");
          this.deps.renderer.renderLine(finalOutput);
        }

        if (startedRendering && terminalStatus === "completed") {
          this.deps.renderer.renderLine("");
        }

        if (this.viewMode === "verbose") {
          const compactSummary = buildCompactRunSummary(eventDigest);
          if (compactSummary) {
            this.deps.renderer.renderLine(compactSummary);
          }
        }

        renderTerminalResultBlock(this.deps.renderer, {
          status: terminalStatus,
          terminalClassification,
          terminalStopReason,
          terminalReason,
          mode: this.viewMode === "verbose" ? "verbose" : "minimal",
        });
        renderCodingResultContract(this.deps.renderer, terminalCodingResult, {
          mode: this.viewMode === "verbose" ? "verbose" : "minimal",
        });

        if (terminalStatus !== "completed") {
          const terminalDetail = terminalStopReason ?? terminalStatus;
          const terminalLabel =
            terminalClassification === "stopped"
              ? "Run stopped"
              : "Run failed";

          this.deps.renderer.renderLine(`\n${terminalLabel}: ${terminalDetail}`);

          const runCommandBlockContext =
            parseRunCommandAllowlistBlockContext(terminalDetail);
          if (runCommandBlockContext) {
            this.deps.renderer.renderLine(
              "Why not executed: run-command intent was blocked by the MVP allowlist.",
            );
            this.deps.renderer.renderLine(
              `Allowed commands: ${runCommandBlockContext.allowedCommands}`,
            );
            this.deps.renderer.renderLine(
              'Hint: rephrase your prompt to request one allowed command, for example: "Run node --version".',
            );
          }

          if (terminalDetail.includes("provider-readiness:network")) {
            this.deps.renderer.renderLine(
              "Hint: check network/proxy/firewall reachability to the provider endpoint, then submit another prompt.",
            );
          } else if (
            terminalDetail.includes("provider-readiness:unsupported-provider")
          ) {
            this.deps.renderer.renderLine(
              "Hint: switch to supported provider with /connect use openai, then submit another prompt.",
            );
          } else if (
            terminalDetail.includes("provider-readiness:missing-config")
          ) {
            this.deps.renderer.renderLine(
              "Hint: configure provider base URL and model via /connect set <provider> <api-key> <base-url> <model>, then submit another prompt.",
            );
          } else if (terminalDetail.includes("provider-readiness:auth")) {
            this.deps.renderer.renderLine(
              "Hint: check provider API key validity/permissions, then submit another prompt.",
            );
          } else if (
            terminalDetail.includes("provider-readiness:missing-key") ||
            terminalDetail.includes("OPENAI_API_KEY")
          ) {
            this.deps.renderer.renderLine(
              "Hint: configure credential via /connect set <provider> <api-key> (or export env var), then submit another prompt.",
            );
          } else if (terminalDetail.includes("Approval denied by user")) {
            this.deps.renderer.renderLine(
              "Hint: submit another prompt and approve escalation when asked.",
            );
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

function buildCompactRunSummary(digest: RuntimeEventDigest): string | null {
  const summaryParts: string[] = [];

  if (digest.approvalsRequested > 0) {
    summaryParts.push(
      `approvals ${digest.approvalsApproved}/${digest.approvalsRequested} approved`,
    );
  }
  if (digest.toolsStarted > 0) {
    summaryParts.push(
      digest.toolsFailed > 0
        ? `tools ${digest.toolsStarted} run (${digest.toolsFailed} failed)`
        : `tools ${digest.toolsStarted} run`,
    );
  }
  if (digest.retries > 0) {
    summaryParts.push(`retries ${digest.retries}`);
  }
  if (digest.mcpSnapshots > 0) {
    summaryParts.push(`mcp clients=${digest.mcpClients} tools=${digest.mcpTools}`);
  }

  if (summaryParts.length === 0) {
    return null;
  }

  return `Run summary: ${summaryParts.join(" | ")}\n`;
}

function renderTerminalResultBlock(
  renderer: StreamingRenderer,
  input: {
    status: OrchestrationStatus;
    terminalClassification: "success" | "stopped" | "error";
    terminalStopReason?: string;
    terminalReason: TerminalReason;
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
        : input.terminalStopReason ?? input.status;
    renderer.renderLine(`Result: ${statusLabel} (${detail})`);
    renderer.renderLine("");
    return;
  }
  renderer.renderLine("Final result");
  renderer.renderLine(`- Classification: ${statusLabel}`);
  renderer.renderLine(`- Terminal reason: ${input.terminalReason}`);
  if (input.status !== "completed") {
    renderer.renderLine(`- Stop detail: ${input.terminalStopReason ?? input.status}`);
  }
  renderer.renderLine("");
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
    renderer.renderLine(
      `Task: ${codingResult.taskKind} | Changed: ${changedFilesSummary} | Verify: ${verificationStatus}`,
    );
    if (codingResult.verification.nextAction) {
      renderer.renderLine(`Next: ${codingResult.verification.nextAction}`);
    } else if (codingResult.taskSatisfaction.reasons.length > 0) {
      renderer.renderLine(
        `Notes: ${codingResult.taskSatisfaction.reasons[0]}`,
      );
    }
    renderer.renderLine("");
    return;
  }

  renderer.renderLine("Coding result");
  renderer.renderLine(`- Task kind: ${codingResult.taskKind}`);
  if (codingResult.changedFiles.length > 0) {
    renderer.renderLine(`- Changed files: ${codingResult.changedFiles.join(", ")}`);
  } else {
    renderer.renderLine("- Changed files: none");
  }
  if (codingResult.failedFiles.length > 0) {
    renderer.renderLine(
      `- Failed files: ${codingResult.failedFiles.map((entry) => `${entry.path} (${entry.reason})`).join("; ")}`,
    );
  }
  if (codingResult.verifiedFiles.length > 0) {
    renderer.renderLine(`- Verified files: ${codingResult.verifiedFiles.join(", ")}`);
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
    renderer.renderLine(`- Verify command: ${codingResult.verification.command}`);
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
    renderer.renderLine(`- Repair notes: ${codingResult.repair.notes.join(" | ")}`);
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
