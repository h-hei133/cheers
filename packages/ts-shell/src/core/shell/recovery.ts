import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  ResumeResult,
  SessionResumeEligibility,
  SessionContinuitySnapshot,
  SessionManager,
  SessionReentrySummary,
} from "../../session/SessionManager.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import { CONTINUATION_SAFETY_POLICY } from "../query/runtimeState.js";
import {
  applyShellSubstrateTransition,
  type ShellRuntimeContext,
} from "./runtimeContext.js";

function isFailedResume(
  result: ResumeResult,
): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false;
}

function guardRuntimeSeedForRecovery<
  T extends {
    config: { startingRole: string };
    recoveryBoundary:
      | "fresh-entry"
      | "completed-turn-reentry"
      | "mid-turn-reentry";
    currentRole: string;
    turn: number;
    truthBoundary: {
      pairedTurnCount: number;
      continuationSafety: keyof typeof CONTINUATION_SAFETY_POLICY;
    };
  },
>(runtimeSeed: T): T {
  const policy =
    CONTINUATION_SAFETY_POLICY[runtimeSeed.truthBoundary.continuationSafety];

  if (runtimeSeed.recoveryBoundary === policy.runtimeRecoveryBoundary) {
    return runtimeSeed;
  }

  if (policy.resetToStartingRole) {
    return {
      ...runtimeSeed,
      recoveryBoundary: policy.runtimeRecoveryBoundary,
      currentRole: runtimeSeed.config.startingRole,
      turn: 1,
    };
  }

  return {
    ...runtimeSeed,
    recoveryBoundary: policy.runtimeRecoveryBoundary,
  };
}

export async function resumeShellSession(input: {
  requestedSessionId?: string;
  fallbackSessionId?: string;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
  renderer: StreamingRenderer;
}): Promise<
  | { resumed: false }
  | {
      resumed: true;
      autoResume:
        | {
            prompt: string;
            runtimeSeed: ReturnType<SessionManager["buildRuntimeStateSeed"]>;
            continuityState?: SessionContinuitySnapshot;
          }
        | null;
      disposition: SessionResumeEligibility["disposition"];
    }
> {
  const reentrySummaries =
    typeof input.sessionManager.listReentrySummaries === "function"
      ? input.sessionManager.listReentrySummaries({
          limit: 3,
          preferredProjectRoot: input.runtimeContext.projectRoot,
        })
      : [];
  const preferredSummary = reentrySummaries.find((summary) => summary.recoverable);
  if (!input.requestedSessionId && reentrySummaries.length > 0) {
    input.renderer.renderLine("\nResume candidates:");
    for (const summary of reentrySummaries) {
      input.renderer.renderLine(
        `- ${summary.id} [${summary.status}] @${summary.projectRoot} ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""} updated=${summary.updatedAt}`,
      );
    }
    input.renderer.renderLine("");
  }

  const requestedSessionId =
    input.requestedSessionId ??
    input.fallbackSessionId ??
    preferredSummary?.id ??
    input.sessionManager.getSuggestedRecoverySession()?.id;

  if (!requestedSessionId) {
    const recoveryBlock = input.sessionManager.getRecoveryTrustBoundaryBlock();
    if (recoveryBlock) {
      input.renderer.renderLine(
        `\nRecovery blocked for session ${recoveryBlock.sessionId}: ${recoveryBlock.detail}`,
      );
      input.renderer.renderLine(`Hint: ${recoveryBlock.recoveryHint}\n`);
      return { resumed: false };
    }

    input.renderer.renderLine("\nNo recoverable session found.\n");
    return { resumed: false };
  }

  const resumeResult = input.sessionManager.tryResume(
    requestedSessionId,
    input.runtimeContext.projectRoot,
    { mode: "runtime-recovery" },
  );
  if (isFailedResume(resumeResult)) {
    input.renderer.renderLine(`\nResume failed: ${resumeResult.error}`);
    input.renderer.renderLine(`Hint: ${resumeResult.recoveryHint}\n`);
    return { resumed: false };
  }

  const resumedProjectRoot =
    resumeResult.session.projectRoot || input.runtimeContext.projectRoot;
  applyShellSubstrateTransition(input.runtimeContext, {
    cwd: resumedProjectRoot,
    projectRoot: resumedProjectRoot,
    gitContext: getWorkflowGitContext(resumedProjectRoot),
    session: resumeResult.session,
    sessionProjectDir: resumedProjectRoot,
  });
  input.renderer.renderLine(
    `\nResumed session ${input.runtimeContext.session.id}`,
  );
  input.renderer.renderLine(
    `Project context: ${input.runtimeContext.projectRoot}\n`,
  );
  const resumedSummary =
    typeof input.sessionManager.describeSessionReentry === "function"
      ? input.sessionManager.describeSessionReentry(
          input.runtimeContext.session.id,
        )
      : undefined;
  const resumeEligibility =
    typeof input.sessionManager.getSessionResumeEligibility === "function"
      ? input.sessionManager.getSessionResumeEligibility(
          input.runtimeContext.session.id,
        )
      : undefined;
  if (resumedSummary) {
    renderResumedContextSummary(
      (line) => input.renderer.renderLine(line),
      resumedSummary,
    );
  }

  const recoverySnapshot = input.sessionManager.getRecoverySnapshot(
    input.runtimeContext.session.id,
  );
  const pendingPrompt =
    input.runtimeContext.session.pendingPrompt ??
    recoverySnapshot.pendingPrompt;

  if (
    recoverySnapshot.interruptedKind === "turn" ||
    recoverySnapshot.interruptedKind === "prompt" ||
    Object.keys(recoverySnapshot.pendingLifecycle.pendingApprovals).length >
      0 ||
    Object.keys(recoverySnapshot.pendingLifecycle.pendingTools).length > 0
  ) {
    input.sessionManager.reconcilePendingLifecycle(
      input.runtimeContext.session.id,
    );
  }

  const canAutoResume = resumeEligibility?.autoResumeReady === true;
  if (canAutoResume && (pendingPrompt || recoverySnapshot.runPhase === "turn-active")) {
    const continuitySnapshot =
      typeof input.sessionManager.buildContinuitySnapshot === "function"
        ? input.sessionManager.buildContinuitySnapshot(
            input.runtimeContext.session.id,
          )
        : undefined;
    const runtimeSeed = input.sessionManager.buildRuntimeStateSeed(
      input.runtimeContext.session.id,
      { maxTurns: input.runtimeContext.runtimeConfig.maxTurns },
    );
    const guardedRuntimeSeed = guardRuntimeSeedForRecovery(runtimeSeed);
    if (
      guardedRuntimeSeed.recoveryBoundary !== runtimeSeed.recoveryBoundary
    ) {
      input.renderer.renderLine(
        `\nRecovery guardrail downgraded continuation to ${guardedRuntimeSeed.recoveryBoundary}.`,
      );
    }
    const effectivePrompt =
      pendingPrompt ?? guardedRuntimeSeed.config.initialPrompt;
    if (effectivePrompt?.trim()) {
      if (
        continuitySnapshot?.lastStagedRepairStepCount &&
        continuitySnapshot.lastStagedRepairStepCount > 1
      ) {
        const completed = continuitySnapshot.lastStagedRepairCompletedStep ?? 0;
        const nextStep = continuitySnapshot.lastStagedRepairNextStep;
        if (nextStep && nextStep > 1) {
          input.renderer.renderLine(
            `Staged recovery checkpoint: completed step ${completed}/${continuitySnapshot.lastStagedRepairStepCount}; resuming from step ${nextStep}.`,
          );
        } else {
          input.renderer.renderLine(
            `Staged recovery checkpoint: completed step ${completed}/${continuitySnapshot.lastStagedRepairStepCount}.`,
          );
        }
      }
      input.renderer.renderLine(
        `Continuation ready: resuming pending turn for prompt: ${effectivePrompt}\n`,
      );
      return {
        resumed: true,
        autoResume: {
          prompt: effectivePrompt,
          runtimeSeed: guardedRuntimeSeed,
          continuityState: continuitySnapshot,
        },
        disposition: "fully-resumable",
      };
    }
  }

  if (resumeEligibility?.disposition === "partially-resumable") {
    input.renderer.renderLine(
      "Resume opened session context, but auto-continue is not available for this recovery state.",
    );
    input.renderer.renderLine(
      "Next: submit an explicit follow-up prompt to continue from this context.\n",
    );
  }

  return {
    resumed: true,
    autoResume: null,
    disposition: resumeEligibility?.disposition ?? "partially-resumable",
  };
}

function renderResumedContextSummary(
  renderLine: (line: string) => void,
  summary: SessionReentrySummary,
): void {
  renderLine(`Session status: ${summary.status}`);
  if (summary.title?.trim()) {
    renderLine(`Session title: ${summary.title.trim()}`);
  }
  if (summary.pendingPrompt?.trim()) {
    renderLine(`Pending prompt: ${truncate(summary.pendingPrompt.trim(), 160)}`);
  } else if (summary.lastUserMessage?.trim()) {
    renderLine(
      `Last user request: ${truncate(summary.lastUserMessage.trim(), 160)}`,
    );
  }

  renderLine(
    `Resume disposition: ${renderResumeDispositionLabel(summary.resumeDisposition)}${summary.autoResumeReady ? " (auto-resume-ready)" : ""}`,
  );
  const resumeDetail = summary.resumeDetail?.trim() ?? "";
  if (resumeDetail) {
    renderLine(`Resume detail: ${truncate(resumeDetail, 180)}`);
  }
  if (summary.terminalClassification || summary.terminalReason) {
    renderLine(
      `Last terminal: ${summary.terminalClassification ?? "unknown"}${summary.terminalReason ? ` (${summary.terminalReason})` : ""}`,
    );
  }
  if (summary.stagedRepairStepCount && summary.stagedRepairStepCount > 1) {
    const completed = summary.stagedRepairCompletedStep ?? 0;
    const blockedStep = summary.stagedRepairBlockedStep;
    const nextStep = summary.stagedRepairNextStep;
    const suffix = blockedStep
      ? ` blocked-at=${blockedStep}`
      : nextStep
        ? ` next-step=${nextStep}`
        : "";
    renderLine(
      `Staged checkpoint: ${completed}/${summary.stagedRepairStepCount}${suffix}`.trim(),
    );
  }
  renderLine("");
}

function renderResumeDispositionLabel(
  disposition: SessionResumeEligibility["disposition"],
): string {
  switch (disposition) {
    case "fully-resumable":
      return "fully-resumable";
    case "partially-resumable":
      return "partially-resumable";
    default:
      return "not-resumable";
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
