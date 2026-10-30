import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type {
  ResumeResult,
  RecoverySnapshot,
  SessionContinuitySnapshot,
  SessionManager,
  SessionReentrySummary,
  SessionResumeEligibility,
} from "../../session/SessionManager.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import { CONTINUATION_SAFETY_POLICY } from "../query/runtime/state.js";
import {
  applyShellSubstrateTransition,
  type ShellRuntimeContext,
} from "./runtimeContext.js";

export function resolveSessionReference(input: {
  readonly reference?: string;
  readonly sessionManager: SessionManager;
  readonly preferredProjectRoot?: string;
  readonly signal?: AbortSignal;
}): ReturnType<SessionManager['catalog']['resolve']> {
  return input.sessionManager.catalog.resolve(input.reference ?? '', {
    projectRoot: input.preferredProjectRoot,
    signal: input.signal,
  });
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
  readonly selection?: import('../../session/navigation/selection.js').SavedSessionSelection;
  requestedSessionId?: string;
  fallbackSessionId?: string;
  /** True for `/continue`, which recovers an interrupted run rather than opening a session. */
  recoveryOnly?: boolean;
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
    !input.requestedSessionId?.trim() && typeof input.sessionManager.listReentrySummaries === "function"
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
    const expectedSessionId = input.runtimeContext.session.id;
    const expectedProjectRoot = input.runtimeContext.projectRoot;
    const resolved = await resolveSessionReference({
      reference: input.requestedSessionId,
      sessionManager: input.sessionManager,
      preferredProjectRoot: input.runtimeContext.projectRoot,
    });
    if (input.runtimeContext.session.id !== expectedSessionId || input.runtimeContext.projectRoot !== expectedProjectRoot) {
      input.renderer.renderLine('The active session or project changed while resolving the reference. No session was resumed.');
      return { resumed: false };
    }
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        const hintItems = (resolved.candidates ?? []).slice(0, 3);
        input.renderer.renderLine(
          `\nResume target '${input.requestedSessionId}' is ambiguous.`,
        );
        for (const candidate of hintItems) {
          const title = candidate.title?.trim() || "(untitled)";
          input.renderer.renderLine(
            `- ${candidate.id} [${candidate.status ?? 'unknown'}] ${title}`,
          );
        }
        input.renderer.renderLine(
          "Hint: use a longer session id prefix or exact session id from /resume list.\n",
        );
      } else if (resolved.reason === 'incomplete') {
        input.renderer.renderLine('\nSaved sessions could not be fully checked. Use an exact session ID or retry after the unavailable records are repaired. No session was resumed.\n');
      } else {
        input.renderer.renderLine(
          `\nResume target '${input.requestedSessionId}' was not found.`,
        );
        input.renderer.renderLine(
          "Hint: run /resume list, then /resume <session-id|prefix|title|last>.\n",
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

  const validateSelection = (): void => {
    if (!input.selection) return;
    let blocked: string | undefined;
    try { blocked = input.selection.admission(); }
    catch { throw new Error('The saved session selection is unavailable. Reopen the session picker.'); }
    if (blocked) throw new Error(blocked);
    if (input.selection.sessionId !== requestedSessionId) throw new Error('The selected session changed. Reopen the session picker.');
  };
  try { validateSelection(); }
  catch (error) {
    input.renderer.renderLine(error instanceof Error ? error.message : 'The saved session selection is unavailable.');
    return { resumed: false };
  }

  // Already here. Saying so is the whole answer — the old path ran the recovery
  // gate, which refuses a session that is merely *fine*, and reported that as
  // "not recoverable" for the session the user was sitting in.
  //
  // Two exceptions. `/continue` targets the current session by design — continuing
  // what you are in is the entire point of it. And a session holding a prompt that
  // never ran has real work to pick up, so refusing that would be the same
  // unhelpfulness in a different place.
  const pendingHere = hasPendingPromptHere(input);
  if (
    input.recoveryOnly !== true &&
    !pendingHere &&
    requestedSessionId === input.runtimeContext.session.id
  ) {
    input.renderer.renderLine(
      `\nAlready in session ${requestedSessionId}. Use /resume list to pick a different one.\n`,
    );
    return { resumed: false };
  }

  // Opening a session is not the same act as recovering an interrupted run.
  // `/resume` is the first: it makes a session current and restores its context,
  // whatever state it ended in. `/continue` is the second, and keeps the gate.
  const resumeResult = input.sessionManager.tryResume(
    requestedSessionId,
    input.runtimeContext.projectRoot,
    { mode: input.recoveryOnly === true ? "runtime-recovery" : "continuity-only",
      ...(input.selection ? { expectedVersion: input.selection.version, beforeActivate: validateSelection } : {}) },
  );
  if (isFailedResume(resumeResult)) {
    if (resumeResult.activation === 'unknown') input.runtimeContext.workspaceIssue = resumeResult.recoveryHint;
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
  if (resumeResult.warning) {
    input.runtimeContext.workspaceIssue = resumeResult.warning;
    input.renderer.renderLine(resumeResult.warning);
    return { resumed: true, autoResume: null, disposition: 'not-resumable' };
  }
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
  const pendingPrompt = recoverySnapshot.pendingPrompt;

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
    (pendingPrompt !== undefined || recoverySnapshot.runPhase === "turn-active")
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
    if (effectivePrompt !== undefined) {
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
    if (continuity.lastSuccessHandoffDiagnostic) {
      lines.push(
        `- success-handoff-diagnostic: ${truncate(continuity.lastSuccessHandoffDiagnostic, 220)}`,
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

/**
 * Whether the session the shell is already in holds a prompt that never ran.
 *
 * Asked before refusing to re-open the current session: a pending prompt is real
 * work to pick up, and refusing that would be the same unhelpfulness the recovery
 * gate used to produce. A session the store cannot describe has nothing pending as
 * far as anyone can tell, which is the safe reading.
 */
function hasPendingPromptHere(input: {
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
}): boolean {
  if (typeof input.sessionManager.describeSessionReentry !== "function") return false;
  try {
    const summary = input.sessionManager.describeSessionReentry(
      input.runtimeContext.session.id,
    );
    return Boolean(summary?.pendingPrompt?.trim()) || summary?.autoResumeReady === true;
  } catch {
    return false;
  }
}
