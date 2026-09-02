import type { ShellActionResult } from "../commands/types.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  ResumeResult,
  Session,
  SessionContinuitySnapshot,
  SessionManager,
} from "../../session/SessionManager.js";
import { resumeShellSession } from "./recovery.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";
import { renderStoppedContinueGuidanceSurface } from "./sessionStateSurface.js";

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

    if (
      targetSummary?.status === "completed" ||
      targetSummary?.terminalClassification === "stopped"
    ) {
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

      if (targetSummary.terminalClassification === "stopped") {
        renderStoppedContinueGuidanceSurface(options.renderer, {
          printMode: options.printMode,
          sessionId: targetSessionId,
          summary: targetSummary,
          snapshot: options.sessionManager.buildContinuitySnapshot(targetSessionId),
        });
      }

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
      renderStoppedContinueGuidanceSurface(options.renderer, {
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
    // `/continue` is the recovery door: it exists to pick up an interrupted run,
    // so it keeps the gate that refuses a session with nothing to continue.
    recoveryOnly: options.slashResult.action === "continue-session",
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
