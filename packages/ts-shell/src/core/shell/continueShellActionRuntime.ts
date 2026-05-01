import type { ShellActionResult } from "../commands/types.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  ResumeResult,
  Session,
  SessionContinuitySnapshot,
  SessionManager,
  SessionReentrySummary,
} from "../../session/SessionManager.js";
import { resumeShellSession } from "./recovery.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

export type ResumeLikeShellAction = ShellActionResult & {
  action: "resume-session" | "continue-session";
};

export interface ResumeLikePromptTurnInput {
  readonly effectivePrompt: string;
  readonly runtimeSeed?: ReturnType<SessionManager["buildRuntimeStateSeed"]>;
  readonly continuityState?: SessionContinuitySnapshot;
  readonly turnNumber?: number;
  readonly turnOrigin: "resumed" | "continued";
}

function isFailedResumeResult(
  result: ResumeResult,
): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false;
}

function renderStoppedContinueGuidance(input: {
  renderer: StreamingRenderer;
  printMode: boolean;
  sessionId: string;
  summary: SessionReentrySummary;
  snapshot: SessionContinuitySnapshot;
}): void {
  const failedFiles = input.snapshot.recentFailedFiles
    .map((entry) => `${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`)
    .join(", ");
  const reason =
    input.snapshot.lastVerificationReason ??
    input.snapshot.lastFailure ??
    input.summary.blockedDetail ??
    input.summary.resumeDetail ??
    "The previous run stopped before the task could continue automatically.";
  const blockerKind =
    input.snapshot.lastVerificationBlockerKind ??
    input.summary.blockedReason ??
    "stopped-result";
  const doNext =
    input.snapshot.lastVerificationNextAction ??
    `Use /continue <follow-up prompt> with a concrete repair instruction for session ${input.sessionId}.`;

  if (!input.printMode) {
    input.renderer.renderLine("");
  }
  input.renderer.renderLine("Result");
  input.renderer.renderLine("- Outcome: stopped");
  input.renderer.renderLine("- TerminalState: stopped");
  input.renderer.renderLine(`- BlockerKind: ${blockerKind}`);
  input.renderer.renderLine(`- Reason: ${reason}`);
  if (failedFiles) {
    input.renderer.renderLine(`- Failed files: ${failedFiles}`);
  }
  input.renderer.renderLine(`- DoNext: ${doNext}`);
  input.renderer.renderLine(
    `- Next action: Use /continue <follow-up prompt> or provide a concrete repair instruction to continue session ${input.sessionId}.`,
  );
  if (!input.printMode) {
    input.renderer.renderLine("");
  }
}

export async function runResumeLikeShellAction(options: {
  slashResult: ResumeLikeShellAction;
  source: "interactive" | "non-interactive";
  printMode: boolean;
  fallbackSessionId?: string;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
  turnNumber?: number;
  normalizePromptForExecution: (prompt: string) => string;
  switchRuntimeSessionProjectContext: (
    runtimeContext: ShellRuntimeContext,
    session: Session,
  ) => void;
  renderSessionCommandMap: (
    renderer: StreamingRenderer,
    options: { compact: boolean; includeHelpHint: boolean },
  ) => void;
  executeResolvedPromptTurn: (
    input: ResumeLikePromptTurnInput,
  ) => Promise<void>;
}): Promise<{ turnNumber: number }> {
  const continuationPrompt =
    options.slashResult.action === "continue-session"
      ? options.slashResult.continuationPrompt?.trim()
      : undefined;
  const targetSessionId =
    options.slashResult.sessionId ?? options.runtimeContext.session.id;

  if (continuationPrompt) {
    const targetSummary = (() => {
      try {
        return options.sessionManager.describeSessionReentry(targetSessionId);
      } catch {
        return null;
      }
    })();

    if (targetSummary?.status === "completed") {
      const resumeResult = options.sessionManager.tryResume(
        targetSessionId,
        options.runtimeContext.projectRoot,
        { mode: "continuity-only" },
      );
      if (isFailedResumeResult(resumeResult)) {
        options.renderer.renderLine(
          options.printMode
            ? `Continue failed: ${resumeResult.error}\nHint: ${resumeResult.recoveryHint}`
            : `\nContinue failed: ${resumeResult.error}\nHint: ${resumeResult.recoveryHint}\n`,
        );
        return { turnNumber: options.turnNumber ?? 0 };
      }

      options.switchRuntimeSessionProjectContext(
        options.runtimeContext,
        resumeResult.session,
      );

      const nextTurn = (options.turnNumber ?? 0) + 1;
      const effectiveFollowUp =
        options.normalizePromptForExecution(continuationPrompt);
      await options.executeResolvedPromptTurn({
        effectivePrompt: effectiveFollowUp,
        continuityState: options.sessionManager.buildContinuitySnapshot(
          resumeResult.session.id,
        ),
        turnNumber: options.source === "interactive" ? nextTurn : undefined,
        turnOrigin: "continued",
      });
      return { turnNumber: nextTurn };
    }
  }

  if (options.slashResult.action === "continue-session") {
    const targetSummary = (() => {
      try {
        return options.sessionManager.describeSessionReentry(targetSessionId);
      } catch {
        return null;
      }
    })();
    if (targetSummary?.terminalClassification === "stopped") {
      renderStoppedContinueGuidance({
        renderer: options.renderer,
        printMode: options.printMode,
        sessionId: targetSessionId,
        summary: targetSummary,
        snapshot: options.sessionManager.buildContinuitySnapshot(targetSessionId),
      });
      return { turnNumber: options.turnNumber ?? 0 };
    }
  }

  const resumed = await resumeShellSession({
    requestedSessionId: options.slashResult.sessionId,
    fallbackSessionId: options.fallbackSessionId,
    sessionManager: options.sessionManager,
    runtimeContext: options.runtimeContext,
    renderer: options.renderer,
  });
  if (!resumed.resumed) {
    return { turnNumber: options.turnNumber ?? 0 };
  }

  if (continuationPrompt) {
    const nextTurn = (options.turnNumber ?? 0) + 1;
    const effectiveFollowUp =
      options.normalizePromptForExecution(continuationPrompt);
    await options.executeResolvedPromptTurn({
      effectivePrompt: effectiveFollowUp,
      turnNumber: options.source === "interactive" ? nextTurn : undefined,
      turnOrigin: "continued",
    });
    return { turnNumber: nextTurn };
  }

  if (resumed.autoResume) {
    const nextTurn = (options.turnNumber ?? 0) + 1;
    await options.executeResolvedPromptTurn({
      effectivePrompt: resumed.autoResume.prompt,
      runtimeSeed: resumed.autoResume.runtimeSeed,
      continuityState: resumed.autoResume.continuityState,
      turnNumber: options.source === "interactive" ? nextTurn : undefined,
      turnOrigin: "resumed",
    });
    return { turnNumber: nextTurn };
  }

  if (options.slashResult.action === "continue-session") {
    options.renderer.renderLine(
      options.printMode
        ? "Session continuation ready. Submit an explicit follow-up prompt."
        : "Session continuation ready. Enter your next instruction, or use /continue <follow-up prompt>.\n",
    );
    options.renderSessionCommandMap(options.renderer, {
      compact: options.printMode,
      includeHelpHint: false,
    });
    if (!options.printMode) {
      options.renderer.renderLine("");
    }
  }

  if (options.slashResult.action === "resume-session") {
    options.renderSessionCommandMap(options.renderer, {
      compact: options.printMode,
      includeHelpHint: false,
    });
    if (!options.printMode) {
      options.renderer.renderLine("");
    }
  }

  return { turnNumber: options.turnNumber ?? 0 };
}
