import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  ResumeResult,
  RecoverySnapshot,
  SessionContinuitySnapshot,
  SessionManager,
  SessionReentrySummary,
  SessionResumeEligibility,
} from "../../session/SessionManager.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import { CONTINUATION_SAFETY_POLICY } from "../query/runtimeState.js";
import {
  applyShellSubstrateTransition,
  type ShellRuntimeContext,
} from "./runtimeContext.js";

interface SessionReferenceResolution {
  readonly ok: boolean;
  readonly sessionId?: string;
  readonly reason?: "not-found" | "ambiguous";
  readonly candidates?: readonly SessionReentrySummary[];
}

export function resolveSessionReference(input: {
  readonly reference?: string;
  readonly sessionManager: SessionManager;
  readonly preferredProjectRoot?: string;
}): SessionReferenceResolution {
  const reference = input.reference?.trim();
  if (!reference) {
    return { ok: false, reason: "not-found", candidates: [] };
  }

  const lowerReference = reference.toLowerCase();
  const summaries =
    typeof input.sessionManager.listReentrySummaries === "function"
      ? input.sessionManager.listReentrySummaries({
          limit: 24,
          preferredProjectRoot: input.preferredProjectRoot,
        })
      : [];

  if (lowerReference === "last" || lowerReference === "latest") {
    return summaries[0]
      ? { ok: true, sessionId: summaries[0].id }
      : { ok: false, reason: "not-found", candidates: [] };
  }

  if (input.sessionManager.sessionExists(reference)) {
    return { ok: true, sessionId: reference };
  }

  const exactMatches = summaries.filter(
    (summary) => summary.id.toLowerCase() === lowerReference,
  );
  if (exactMatches.length === 1) {
    return { ok: true, sessionId: exactMatches[0].id };
  }

  const prefixMatches = summaries.filter((summary) =>
    summary.id.toLowerCase().startsWith(lowerReference),
  );
  if (prefixMatches.length === 1) {
    return { ok: true, sessionId: prefixMatches[0].id };
  }
  if (prefixMatches.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: prefixMatches };
  }

  const titleMatches = summaries.filter((summary) =>
    summary.title?.trim().toLowerCase().includes(lowerReference),
  );
  if (titleMatches.length === 1) {
    return { ok: true, sessionId: titleMatches[0].id };
  }
  if (titleMatches.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: titleMatches };
  }

  return { ok: false, reason: "not-found", candidates: summaries.slice(0, 5) };
}

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
      autoResume: {
        prompt: string;
        runtimeSeed: ReturnType<SessionManager["buildRuntimeStateSeed"]>;
        continuityState?: SessionContinuitySnapshot;
      } | null;
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
  const preferredSummary = reentrySummaries.find(
    (summary) => summary.recoverable,
  );
  if (!input.requestedSessionId && reentrySummaries.length > 0) {
    input.renderer.renderLine("\nResume candidates:");
    for (const summary of reentrySummaries) {
      input.renderer.renderLine(
        `- ${summary.id} [${summary.status}] @${summary.projectRoot} ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""} updated=${summary.updatedAt}`,
      );
    }
    input.renderer.renderLine("");
  }

  let requestedSessionId =
    input.requestedSessionId ??
    input.fallbackSessionId ??
    preferredSummary?.id ??
    input.sessionManager.getSuggestedRecoverySession()?.id;

  if (input.requestedSessionId?.trim()) {
    const resolved = resolveSessionReference({
      reference: input.requestedSessionId,
      sessionManager: input.sessionManager,
      preferredProjectRoot: input.runtimeContext.projectRoot,
    });
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        const hintItems = (resolved.candidates ?? []).slice(0, 3);
        input.renderer.renderLine(
          `\nResume target '${input.requestedSessionId}' is ambiguous.`,
        );
        for (const candidate of hintItems) {
          const title = candidate.title?.trim() || "(untitled)";
          input.renderer.renderLine(
            `- ${candidate.id} [${candidate.status}] ${title}`,
          );
        }
        input.renderer.renderLine(
          "Hint: use a longer session id prefix or exact session id from /sessions list.\n",
        );
      } else {
        input.renderer.renderLine(
          `\nResume target '${input.requestedSessionId}' was not found.`,
        );
        input.renderer.renderLine(
          "Hint: run /sessions list, then /resume <session-id|prefix|title|last>.\n",
        );
      }
      return { resumed: false };
    }
    requestedSessionId = resolved.sessionId;
  }

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
  if (
    canAutoResume &&
    (pendingPrompt || recoverySnapshot.runPhase === "turn-active")
  ) {
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
    if (guardedRuntimeSeed.recoveryBoundary !== runtimeSeed.recoveryBoundary) {
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
      const continuationPrompt = buildInterruptedContinuationPrompt({
        originalPrompt: effectivePrompt,
        recoverySnapshot,
        runtimeSeed: guardedRuntimeSeed,
        continuitySnapshot,
      });
      return {
        resumed: true,
        autoResume: {
          prompt: continuationPrompt,
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

function buildInterruptedContinuationPrompt(input: {
  readonly originalPrompt: string;
  readonly recoverySnapshot: RecoverySnapshot;
  readonly runtimeSeed: ReturnType<SessionManager["buildRuntimeStateSeed"]>;
  readonly continuitySnapshot?: SessionContinuitySnapshot;
}): string {
  const interrupted =
    input.recoverySnapshot.interruptedKind === "turn" ||
    input.recoverySnapshot.interruptedKind === "prompt" ||
    input.recoverySnapshot.runPhase === "turn-active" ||
    input.recoverySnapshot.runPhase === "prompt-persisted";
  if (!interrupted) {
    return input.originalPrompt;
  }

  const lines: string[] = [
    "Continue the interrupted task using the recovery evidence below.",
    `Original user request: ${input.originalPrompt}`,
    "",
    "Interrupted turn context:",
    `- interrupted-kind: ${input.recoverySnapshot.interruptedKind ?? "unknown"}`,
    `- run-phase: ${input.recoverySnapshot.runPhase ?? "unknown"}`,
    `- recovery-boundary: ${input.runtimeSeed.recoveryBoundary}`,
    `- continuation-safety: ${input.runtimeSeed.truthBoundary.continuationSafety}`,
  ];
  const interruptionReason = deriveInterruptionReason(input.recoverySnapshot);
  if (interruptionReason) {
    lines.push(`- interruption-reason: ${truncate(interruptionReason, 180)}`);
  }
  if (input.recoverySnapshot.repairSummary.insertedPromptMessage) {
    lines.push("- replay-repair: inserted missing prompt message");
  }
  if (input.recoverySnapshot.repairSummary.insertedQueryStarted) {
    lines.push("- replay-repair: inserted missing query.started event");
  }
  if (input.recoverySnapshot.repairSummary.strippedInterruptedTerminalEvents > 0) {
    lines.push(
      `- replay-repair: stripped ${input.recoverySnapshot.repairSummary.strippedInterruptedTerminalEvents} interrupted terminal event(s)`,
    );
  }

  const completedActions = input.runtimeSeed.derivedState.transcript.slice(-3);
  if (completedActions.length > 0) {
    lines.push("", "Completed action evidence:");
    for (const action of completedActions) {
      lines.push(`- ${action.role}: ${truncate(action.content, 160)}`);
      for (const note of (action.notes ?? []).slice(0, 3)) {
        lines.push(`  note: ${truncate(note, 140)}`);
      }
      if (action.handoffTo) {
        lines.push(
          `  handoff: ${action.role} -> ${action.handoffTo}${action.handoffReason ? ` (${truncate(action.handoffReason, 100)})` : ""}`,
        );
      }
    }
  }

  const continuity = input.continuitySnapshot;
  if (continuity) {
    lines.push("", "Recovery evidence:");
    if (continuity.lastTaskKind) {
      lines.push(`- last-task-kind: ${continuity.lastTaskKind}`);
    }
    const actionResultSeedLine = formatActionResultSeedEvidenceLine(continuity);
    if (actionResultSeedLine) {
      lines.push(actionResultSeedLine);
    }
    if (continuity.lastActionHandoffSummary) {
      lines.push(
        `- action-handoff-summary: ${truncate(continuity.lastActionHandoffSummary, 180)}`,
      );
    }
    if (continuity.lastSeedInfluenceHandoffSummary) {
      lines.push(
        `- seed-influence-handoff-summary: ${truncate(continuity.lastSeedInfluenceHandoffSummary, 180)}`,
      );
    }
    if (continuity.lastFailureHandoffDiagnostic) {
      lines.push(
        `- failure-handoff-diagnostic: ${truncate(continuity.lastFailureHandoffDiagnostic, 220)}`,
      );
    }
    if (continuity.recentChangedFiles.length > 0) {
      lines.push(
        `- changed-files: ${continuity.recentChangedFiles.join(", ")}`,
      );
    }
    if (continuity.recentVerifiedFiles.length > 0) {
      lines.push(
        `- verified-files: ${continuity.recentVerifiedFiles.join(", ")}`,
      );
    }
    if (continuity.recentFailedFiles.length > 0) {
      lines.push(
        `- failed-files: ${continuity.recentFailedFiles
          .map((entry) => `${entry.path} (${truncate(entry.reason, 100)})`)
          .join(", ")}`,
      );
    }
    if (continuity.lastVerificationStatus) {
      lines.push(`- verification-status: ${continuity.lastVerificationStatus}`);
      if (continuity.lastVerificationCommand) {
        lines.push(`- verification-command: ${continuity.lastVerificationCommand}`);
      }
      if (continuity.lastVerificationReason) {
        lines.push(
          `- verification-reason: ${truncate(continuity.lastVerificationReason, 180)}`,
        );
      }
      if (continuity.lastVerificationBlockerKind) {
        lines.push(
          `- verification-blocker-kind: ${continuity.lastVerificationBlockerKind}`,
        );
      }
    }
    if (continuity.lastContinuationEvidence.length > 0) {
      lines.push(
        `- continuation-evidence: ${continuity.lastContinuationEvidence
          .slice(0, 5)
          .map((entry) => truncate(entry, 140))
          .join(" | ")}`,
      );
    }
    if (continuity.unresolvedItems.length > 0) {
      lines.push(
        `- unresolved-items: ${continuity.unresolvedItems
          .slice(0, 5)
          .map((entry) => truncate(entry, 140))
          .join(" | ")}`,
      );
    }
  }

  lines.push(
    "",
    "Next step:",
    `- ${deriveContinuationNextAction(input.continuitySnapshot)}`,
    "- Continue the same edit/verify flow from this evidence; do not restart with a generic summary or read-only inspection unless the evidence is missing.",
  );

  return lines.join("\n");
}

function formatActionResultSeedEvidenceLine(
  continuity: SessionContinuitySnapshot,
): string | undefined {
  const seed = continuity.lastActionResultSeed;
  if (!seed) {
    return undefined;
  }

  const parts = ["seed=action-result"];
  if (seed.actionKind) {
    parts.push(`action=${seed.actionKind}`);
  }
  if (seed.target) {
    parts.push(`target=${truncate(seed.target, 140)}`);
  }
  const verificationStatus =
    seed.verification?.status ?? continuity.lastVerificationStatus;
  if (verificationStatus) {
    parts.push(`verifyStatus=${verificationStatus}`);
  }
  if (seed.verification?.command) {
    parts.push("verifyCommandInherited=yes");
  }
  const blockerKind = seed.verification?.blockerKind ?? seed.blockerKind;
  if (blockerKind) {
    parts.push(`blocker=${blockerKind}`);
  }
  if (seed.changedFiles?.length) {
    parts.push(`changedFiles=${seed.changedFiles.length}`);
  }
  if (seed.verifiedFiles?.length) {
    parts.push(`verifiedFiles=${seed.verifiedFiles.length}`);
  }

  return `- action-result-seed: ${parts.join(" ")}`;
}

function deriveInterruptionReason(
  recoverySnapshot: RecoverySnapshot,
): string | undefined {
  for (const event of [...recoverySnapshot.transcriptEvents].reverse()) {
    if (event.type === "query-event") {
      if (event.event.type === "lifecycle.cancelled") {
        return event.event.reason;
      }
      if (event.event.type === "lifecycle.error") {
        return event.event.error;
      }
    }
    if (event.type === "lifecycle" && event.event === "run-interrupted") {
      return event.detail ?? "run-interrupted";
    }
  }
  return undefined;
}

function deriveContinuationNextAction(
  continuitySnapshot: SessionContinuitySnapshot | undefined,
): string {
  if (!continuitySnapshot) {
    return "Resume from the interrupted turn and continue the pending task.";
  }
  if (continuitySnapshot.lastVerificationNextAction) {
    return continuitySnapshot.lastVerificationNextAction;
  }
  if (continuitySnapshot.lastVerificationStatus === "failed") {
    return "Inspect the verification failure, adjust the changed files, and rerun the verification command.";
  }
  if (continuitySnapshot.lastVerificationStatus === "blocked") {
    return "Resolve the verification blocker, then rerun the intended verification.";
  }
  if (
    continuitySnapshot.recentChangedFiles.length > 0 &&
    continuitySnapshot.lastVerificationStatus !== "passed"
  ) {
    return "Continue from the changed files and complete or rerun verification for the same task.";
  }
  if (continuitySnapshot.recentFailedFiles.length > 0) {
    return "Continue by fixing the failed file operation using the recorded failed-file evidence.";
  }
  if (continuitySnapshot.lastTaskKind) {
    return `Continue the interrupted ${continuitySnapshot.lastTaskKind} task from the recorded evidence.`;
  }
  return "Continue from the interrupted turn and preserve the existing task intent.";
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
    renderLine(
      `Pending prompt: ${truncate(summary.pendingPrompt.trim(), 160)}`,
    );
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
