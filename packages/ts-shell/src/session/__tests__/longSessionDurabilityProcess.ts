import fs from "node:fs";
import path from "node:path";
import type { ResumeLikePromptTurnInput } from "../../core/shell/continueShellActionRuntime.js";
import { runResumeLikeShellAction } from "../../core/shell/continueShellActionRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../../result/types.js";
import { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import { SessionManager, type Session } from "../SessionManager.js";

type Scenario = "success" | "partial";

const partialFailedReason = "write failed: EACCES";
const partialStopReason =
  "apply_patch multi-file workspace write stopped before success: src/b.ts failed after src/a.ts was verified.";
const partialNextAction = "Inspect/re-read both attempted files before retrying.";

class CapturingRenderer extends StreamingRenderer {
  constructor(private readonly lines: string[]) {
    super();
  }

  override renderLine(line: string): void {
    this.lines.push(line);
  }

  override renderChunk(chunk: string): void {
    this.lines.push(chunk);
  }

  override clearLine(): void {
    // The fixture captures user-visible continuation content and does not need terminal control codes.
  }
}

async function main(): Promise<void> {
  const [mode, scenarioArg, sessionId] = process.argv.slice(2);
  const scenario = parseScenario(scenarioArg);
  if (mode === "seed") {
    writeJson(seedLongSession(scenario));
    return;
  }
  if (mode === "append-unrelated") {
    writeJson(appendUnrelatedTurn(requireSessionId(sessionId), scenario));
    return;
  }
  if (mode === "continue") {
    writeJson(await runContinue(requireSessionId(sessionId), scenario));
    return;
  }
  throw new Error(`Unsupported long-session durability process mode: ${mode ?? "<missing>"}`);
}

function parseScenario(value: string | undefined): Scenario {
  if (value === "success" || value === "partial") {
    return value;
  }
  throw new Error(`Unsupported long-session durability scenario: ${value ?? "<missing>"}`);
}

function requireSessionId(value: string | undefined): string {
  if (value?.trim()) {
    return value.trim();
  }
  throw new Error("Missing session id");
}

function seedLongSession(scenario: Scenario): Record<string, unknown> {
  const manager = new SessionManager();
  const projectRoot = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(),
    "long-session-durability",
    scenario,
  );
  fs.mkdirSync(projectRoot, { recursive: true });
  const session = manager.createNew(projectRoot);
  const prompt =
    scenario === "success"
      ? "update exactly two existing files"
      : "update exactly two existing files with partial failure";

  manager.markRunStarted(session.id, prompt);
  manager.addTurn(session.id, { role: "user", content: prompt });
  manager.recordApprovalAuditDecision(session.id, {
    decision: "allow-once",
    decisionSource: "long-session-durability-fixture",
    persistent: false,
    cacheEffect: "none",
    projectRoot: session.projectRoot,
    cacheKey: `${session.projectRoot.toLowerCase()}|apply_patch:workspace-write`,
    scopeLabel: "apply_patch/workspace-write",
    channel: "non-interactive",
    inputKey: "y",
  });

  for (let index = 0; index < 11; index += 1) {
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: createWarmupResult(session.id, prompt, index),
    });
  }

  const result =
    scenario === "success"
      ? createMutationSuccessResult(session)
      : createMutationPartialFailureResult(session);
  manager.appendQueryEvent(session.id, { type: "query.completed", result });
  manager.addTurn(session.id, {
    role: "assistant",
    content: result.finalOutput || result.stopReason || "mutation stopped",
  });

  if (scenario === "success") {
    manager.saveCompleted(session.id, {
      terminalReason: "completed",
      terminalClassification: "success",
    });
  } else {
    manager.saveError(session.id, partialStopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });
  }

  const state = readState(manager, session.id);
  const snapshot = manager.buildContinuitySnapshot(session.id);
  const context = manager.buildPromptContinuityContext(
    session.id,
    "continue: what changed and what failed?",
  );

  return {
    mode: "seed",
    scenario,
    sessionId: session.id,
    compacted: state.workingMemory?.compacted === true,
    compactReason: state.workingMemory?.compactReason,
    sourceTurnCount: state.workingMemory?.sourceTurnCount,
    summary: state.workingMemory?.summary,
    snapshot: projectSnapshot(snapshot),
    context,
  };
}

function appendUnrelatedTurn(
  sessionId: string,
  scenario: Scenario,
): Record<string, unknown> {
  const manager = new SessionManager();
  const session = manager.resume(sessionId);
  const prompt = "unrelated non-mutation status check after compact";

  manager.markRunStarted(session.id, prompt);
  manager.addTurn(session.id, { role: "user", content: prompt });
  manager.appendQueryEvent(session.id, {
    type: "query.completed",
    result: createUnrelatedChatResult(session.id, prompt),
  });
  manager.addTurn(session.id, {
    role: "assistant",
    content: "Unrelated status check complete.",
  });
  manager.saveCompleted(session.id, {
    terminalReason: "completed",
    terminalClassification: "success",
  });

  const snapshot = manager.buildContinuitySnapshot(session.id);
  const context = manager.buildPromptContinuityContext(
    session.id,
    "continue: recover the prior mutation state",
  );
  return {
    mode: "append-unrelated",
    scenario,
    sessionId,
    snapshot: projectSnapshot(snapshot),
    context,
  };
}

async function runContinue(
  sessionId: string,
  scenario: Scenario,
): Promise<Record<string, unknown>> {
  const manager = new SessionManager();
  const session = manager.resume(sessionId);
  const lines: string[] = [];
  const turns: ResumeLikePromptTurnInput[] = [];
  const runtimeContext = createRuntimeContext(session);

  await runResumeLikeShellAction({
    slashResult: {
      kind: "shell-action",
      action: "continue-session",
      sessionId,
      continuationPrompt:
        scenario === "success"
          ? "what changed in the long session?"
          : "what changed, what failed, and what should I do next?",
    },
    source: "interactive",
    printMode: false,
    fallbackSessionId: sessionId,
    sessionManager: manager,
    runtimeContext,
    renderer: new CapturingRenderer(lines),
    turnNumber: 4,
    switchRuntimeSessionProjectContext: (context, nextSession) => {
      context.session = nextSession;
      context.projectRoot = nextSession.projectRoot;
    },
    renderSessionCommandMap: () => undefined,
    executeResolvedPromptTurn: async (input) => {
      turns.push(input);
      const snapshot = input.continuityState;
      lines.push("FOCUSED_CONTINUATION_QUERY");
      lines.push(`- focus-terminal: ${snapshot?.lastTerminalClassification ?? "unknown"}`);
      lines.push(
        `- focus-changed-files: ${(snapshot?.recentChangedFiles ?? []).join(", ")}`,
      );
      lines.push(
        `- focus-failed-files: ${(snapshot?.recentFailedFiles ?? [])
          .map((entry) => `${entry.path} (${entry.reason})`)
          .join(", ")}`,
      );
      if (snapshot?.lastVerificationBlockerKind) {
        lines.push(`- focus-blocker-kind: ${snapshot.lastVerificationBlockerKind}`);
      }
      if (snapshot?.lastVerificationNextAction) {
        lines.push(`- focus-next-action: ${snapshot.lastVerificationNextAction}`);
      }
      if (snapshot?.lastWriterStarted !== undefined) {
        lines.push(`- focus-writer-started: ${snapshot.lastWriterStarted ? "yes" : "no"}`);
      }
      if (snapshot?.lastWriteEffect) {
        lines.push(`- focus-write-effect: ${snapshot.lastWriteEffect}`);
      }
      if (snapshot?.lastWriteRequiresUserInspection !== undefined) {
        lines.push(
          `- focus-requires-inspection: ${snapshot.lastWriteRequiresUserInspection ? "yes" : "no"}`,
        );
      }
      if (snapshot?.lastWriterStarted || snapshot?.lastVerificationBlockerKind === "partial-mutation-failed") {
        lines.push("- focus-rollback: not attempted");
        lines.push("- focus-atomicity: not claimed");
      }
    },
  });

  return {
    mode: "continue",
    scenario,
    sessionId,
    lines,
    turns: turns.map((turn) => ({
      effectivePrompt: turn.effectivePrompt,
      turnOrigin: turn.turnOrigin,
      continuityState: turn.continuityState
        ? projectSnapshot(turn.continuityState)
        : undefined,
    })),
    snapshot: projectSnapshot(manager.buildContinuitySnapshot(sessionId)),
    context: manager.buildPromptContinuityContext(
      sessionId,
      "continue: what changed and what failed?",
    ),
  };
}

function createRuntimeContext(session: Session): ShellRuntimeContext {
  return {
    cwd: session.projectRoot,
    originalCwd: session.projectRoot,
    projectRoot: session.projectRoot,
    rootMode: "direct",
    requestedWorkspaceRoot: session.projectRoot,
    targetPathBase: session.projectRoot,
    gitRoot: null,
    rootBindingDiagnostics: [],
    runtimeConfig: {
      provider: "synthetic",
      daemonEnabled: false,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: false,
      configSources: [],
    },
    gitContext: {
      insideGit: false,
      branch: null,
      isClean: true,
      root: null,
    },
    session,
    activeSession: {
      sessionId: session.id,
      sessionProjectDir: session.projectRoot,
    },
  } as never;
}

function createWarmupResult(
  sessionId: string,
  prompt: string,
  index: number,
): OrchestrationResult {
  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [],
    sharedContext: {
      sessionId,
      initialPrompt: prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput: `long-session warmup ${index}`,
  };
}

function createUnrelatedChatResult(
  sessionId: string,
  prompt: string,
): OrchestrationResult {
  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [],
    sharedContext: {
      sessionId,
      initialPrompt: prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput: "Unrelated status check complete.",
    codingResult: {
      taskKind: "chat",
      changedFiles: [],
      failedFiles: [],
      patches: [],
      repair: {
        status: "not-needed",
        attempts: 0,
        recoveredItems: [],
        failedItems: [],
        notes: [],
      },
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: [],
        attemptedFiles: [],
        changedFiles: [],
        unchangedAttemptedFiles: [],
      },
      taskSatisfaction: {
        verdict: "satisfied",
        reasons: [],
        requiredEvidence: [],
        observedEvidence: ["unrelated non-mutation turn completed"],
      },
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "not-requested",
        reason: "unrelated non-mutation chat turn",
      },
      evidence: ["long-session-durability:unrelated-non-mutation-turn"],
    },
  };
}

function createMutationSuccessResult(session: Session): OrchestrationResult {
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts", "src/b.ts"],
    failedFiles: [],
    patches: [
      { path: "src/a.ts", operation: "replace", status: "applied" },
      { path: "src/b.ts", operation: "replace", status: "applied" },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: ["long-session-durability:two-file-success"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: ["src/a.ts", "src/b.ts"],
      attemptedFiles: ["src/a.ts", "src/b.ts"],
      changedFiles: ["src/a.ts", "src/b.ts"],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "satisfied",
      reasons: [],
      requiredEvidence: ["readback verification"],
      observedEvidence: ["src/a.ts verified", "src/b.ts verified"],
    },
    verifiedFiles: ["src/a.ts", "src/b.ts"],
    unverifiedFiles: [],
    verification: {
      status: "passed",
      command: "readback verification",
      reason: "Both files matched planned content after write.",
    },
    evidence: [
      "apply-patch-multi-file-workspace-write-result:verified",
      "write-effect:verified",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: "src/a.ts, src/b.ts",
      changedFiles: ["src/a.ts", "src/b.ts"],
      verifiedFiles: ["src/a.ts", "src/b.ts"],
      writerStarted: true,
      writeEffect: "verified",
      verification: {
        status: "passed",
        command: "readback verification",
        reason: "Both files matched planned content after write.",
      },
    },
  };

  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [],
    sharedContext: {
      sessionId: session.id,
      initialPrompt: "update exactly two existing files",
      notes: [],
      handoffs: [],
    },
    finalOutput: "Updated src/a.ts and src/b.ts.",
    codingResult,
  };
}

function createMutationPartialFailureResult(session: Session): OrchestrationResult {
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts"],
    failedFiles: [{ path: "src/b.ts", reason: partialFailedReason }],
    patches: [
      { path: "src/a.ts", operation: "replace", status: "applied" },
      {
        path: "src/b.ts",
        operation: "replace",
        status: "failed",
        reason: partialFailedReason,
      },
    ],
    repair: {
      status: "failed",
      attempts: 1,
      recoveredItems: ["src/a.ts"],
      failedItems: ["src/b.ts"],
      notes: [partialStopReason],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: ["src/a.ts"],
      attemptedFiles: ["src/a.ts", "src/b.ts"],
      changedFiles: ["src/a.ts"],
      unchangedAttemptedFiles: ["src/b.ts"],
    },
    taskSatisfaction: {
      verdict: "completed-with-caveats",
      reasons: [partialStopReason],
      requiredEvidence: ["per-file readback verification"],
      observedEvidence: [
        "mutation-summary-blocker:partial-mutation-failed",
        `mutation-summary-next-action:${partialNextAction}`,
      ],
    },
    verifiedFiles: ["src/a.ts"],
    unverifiedFiles: [{ path: "src/b.ts", reason: partialFailedReason }],
    verification: {
      status: "blocked",
      reason: partialStopReason,
      blockerKind: "unknown",
      nextAction: partialNextAction,
    },
    evidence: [
      "actionable-blocker-kind:partial-mutation-failed",
      `actionable-blocker-next:${partialNextAction}`,
      "apply-patch-multi-file-workspace-write-result:writer-started-no-success",
      "apply-patch-multi-file-workspace-write-result:write-effect:unknown",
      "apply-patch-multi-file-workspace-write-result:user-inspection-required",
      "apply-patch-multi-file-workspace-write-result:no-rollback",
      "write-effect:unknown",
    ],
    failureBoundary: partialStopReason,
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: "src/a.ts, src/b.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "unknown",
      requiresUserInspection: true,
      verification: {
        status: "blocked",
        reason: partialStopReason,
        blockerKind: "unknown",
      },
      reason: partialStopReason,
      blockerKind: "unknown",
    },
  };

  return {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: partialStopReason,
    transcript: [],
    sharedContext: {
      sessionId: session.id,
      initialPrompt: "update exactly two existing files with partial failure",
      notes: [],
      handoffs: [],
    },
    finalOutput: "",
    codingResult,
  };
}

function projectSnapshot(
  snapshot: ReturnType<SessionManager["buildContinuitySnapshot"]>,
): Record<string, unknown> {
  return {
    lastTerminalClassification: snapshot.lastTerminalClassification,
    lastTerminalReason: snapshot.lastTerminalReason,
    lastFailure: snapshot.lastFailure,
    lastTaskKind: snapshot.lastTaskKind,
    recentChangedFiles: snapshot.recentChangedFiles,
    recentVerifiedFiles: snapshot.recentVerifiedFiles,
    recentFailedFiles: snapshot.recentFailedFiles,
    lastVerificationStatus: snapshot.lastVerificationStatus,
    lastVerificationReason: snapshot.lastVerificationReason,
    lastVerificationBlockerKind: snapshot.lastVerificationBlockerKind,
    lastVerificationNextAction: snapshot.lastVerificationNextAction,
    lastWriterStarted: snapshot.lastWriterStarted,
    lastWriteEffect: snapshot.lastWriteEffect,
    lastWriteRequiresUserInspection: snapshot.lastWriteRequiresUserInspection,
    lastFailureHandoffDiagnostic: snapshot.lastFailureHandoffDiagnostic,
    lastSuccessHandoffDiagnostic: snapshot.lastSuccessHandoffDiagnostic,
  };
}

function readState(
  manager: SessionManager,
  sessionId: string,
): {
  readonly workingMemory?: {
    readonly compacted?: boolean;
    readonly compactReason?: string;
    readonly sourceTurnCount?: number;
    readonly summary?: readonly string[];
  };
} {
  const statePath = path.join(manager.getSessionDirPath(sessionId), "state.json");
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as {
    readonly workingMemory?: {
      readonly compacted?: boolean;
      readonly compactReason?: string;
      readonly sourceTurnCount?: number;
      readonly summary?: readonly string[];
    };
  };
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
