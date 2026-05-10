import path from "node:path";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type {
  SessionContinuitySnapshot,
  SessionManager,
  SessionReentrySummary,
} from "../../session/SessionManager.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

export function renderSessionListSurface(
  renderer: StreamingRenderer,
  input: {
    sessionManager: SessionManager;
    activeSessionId: string;
    preferredProjectRoot: string;
  },
): void {
  const summaries = input.sessionManager.listReentrySummaries({
    limit: 10,
    preferredProjectRoot: input.preferredProjectRoot,
  });
  if (summaries.length === 0) {
    renderer.renderLine("\nNo sessions found.\n");
    return;
  }

  renderer.renderLine("\nRe-entry sessions");
  renderer.renderLine(
    "Use /sessions switch <id|prefix|title|last> to jump directly, /resume [id|prefix|title|last] to continue recoverable work, or /sessions current for active-session details.",
  );
  for (const summary of summaries) {
    renderer.renderLine(
      formatSessionListLine({
        summary,
        activeSessionId: input.activeSessionId,
      }),
    );
  }
  renderer.renderLine("");
}

export function renderCurrentSessionSurface(
  renderer: StreamingRenderer,
  input: {
    sessionManager: SessionManager;
    runtimeContext: ShellRuntimeContext;
  },
): void {
  const summary = input.sessionManager.describeSessionReentry(
    input.runtimeContext.session.id,
  );
  for (const line of formatCurrentSessionLines(summary)) {
    renderer.renderLine(line);
  }
}

export function renderSwitchedSessionSurface(
  renderer: StreamingRenderer,
  input: {
    sessionManager: SessionManager;
    sessionId: string;
  },
): void {
  const summary = input.sessionManager.describeSessionReentry(input.sessionId);
  for (const line of formatSwitchedSessionLines(summary)) {
    renderer.renderLine(line);
  }
}

export function renderStoppedContinueGuidanceSurface(
  renderer: StreamingRenderer,
  input: {
    printMode: boolean;
    sessionId: string;
    summary: SessionReentrySummary;
    snapshot: SessionContinuitySnapshot;
  },
): void {
  for (const line of formatStoppedContinueGuidanceLines(input)) {
    renderer.renderLine(line);
  }
}

export function formatSessionListLine(input: {
  summary: SessionReentrySummary;
  activeSessionId: string;
}): string {
  const summary = input.summary;
  const activeMarker = summary.id === input.activeSessionId ? "*" : " ";
  const recoverability =
    summary.resumeDisposition === "fully-resumable"
      ? "fully-resumable"
      : summary.resumeDisposition === "partially-resumable"
        ? "partially-resumable"
        : "blocked";
  const title = summary.title?.trim() || "(untitled)";
  const projectLabel = path.basename(summary.projectRoot) || summary.projectRoot;
  const stateLabels = formatSessionStateLabels(summary);
  const promptLabel = summary.pendingPrompt?.trim()
    ? ` pending="${truncate(summary.pendingPrompt.trim(), 56)}"`
    : summary.lastUserMessage?.trim()
      ? ` last="${truncate(summary.lastUserMessage.trim(), 56)}"`
      : "";
  return `${activeMarker} ${summary.id}  [${summary.status}] [${recoverability}]  ${title}  @${projectLabel}  updated=${toRelativeTime(summary.updatedAt)}${stateLabels}${promptLabel}`;
}

export function formatCurrentSessionLines(
  summary: SessionReentrySummary,
): string[] {
  const title = summary.title?.trim() || "(untitled)";
  const lines = [
    "\nCurrent session",
    `- ID: ${summary.id}`,
    `- Title: ${title}`,
    `- Status: ${summary.status}`,
    `- Resume: ${summary.resumeDisposition}${summary.autoResumeReady ? " (auto)" : ""}`,
    `- Resume detail: ${summary.resumeDetail}`,
  ];
  if (summary.durableStatus) {
    lines.push(`- Durable status: ${summary.durableStatus}`);
  }
  if (summary.runPhase) {
    lines.push(`- Run phase: ${summary.runPhase}`);
  }
  if (!summary.recoverable) {
    lines.push(
      `- Recoverability: blocked (${summary.blockedReason ?? "unknown"})`,
    );
  }
  lines.push(`- Project binding: ${summary.projectRoot}`);
  lines.push(`- Updated: ${summary.updatedAt} (${toRelativeTime(summary.updatedAt)})`);
  if (summary.pendingPrompt?.trim()) {
    lines.push(`- Pending prompt: ${truncate(summary.pendingPrompt.trim(), 180)}`);
  } else if (summary.lastUserMessage?.trim()) {
    lines.push(
      `- Last user request: ${truncate(summary.lastUserMessage.trim(), 180)}`,
    );
  }
  if (summary.lastAssistantMessage?.trim()) {
    lines.push(
      `- Last assistant output: ${truncate(summary.lastAssistantMessage.trim(), 180)}`,
    );
  }
  if (summary.terminalClassification || summary.terminalReason) {
    lines.push(
      `- Last terminal: ${summary.terminalClassification ?? "unknown"}${summary.terminalReason ? ` (${summary.terminalReason})` : ""}`,
    );
  }
  if (!summary.recoverable && summary.blockedDetail) {
    lines.push(`- Recovery boundary: ${truncate(summary.blockedDetail, 180)}`);
  }
  lines.push("");
  return lines;
}

export function formatSwitchedSessionLines(
  summary: SessionReentrySummary,
): string[] {
  const title = summary.title?.trim() || "(untitled)";
  const labels = [
    summary.status,
    ...(summary.durableStatus ? [`durable=${summary.durableStatus}`] : []),
    ...(summary.runPhase ? [`phase=${summary.runPhase}`] : []),
  ];
  const lines = [`Session summary: ${title} [${labels.join("; ")}]`];
  if (summary.pendingPrompt?.trim()) {
    lines.push(
      `Resume cue: pending prompt "${truncate(summary.pendingPrompt.trim(), 140)}"`,
    );
  } else if (summary.lastUserMessage?.trim()) {
    lines.push(
      `Resume cue: last user request "${truncate(summary.lastUserMessage.trim(), 140)}"`,
    );
  }
  if (summary.terminalClassification || summary.terminalReason) {
    lines.push(
      `Last terminal: ${summary.terminalClassification ?? "unknown"}${summary.terminalReason ? ` (${summary.terminalReason})` : ""}`,
    );
  }
  return lines;
}

export function formatStoppedContinueGuidanceLines(input: {
  printMode: boolean;
  sessionId: string;
  summary: SessionReentrySummary;
  snapshot: SessionContinuitySnapshot;
}): string[] {
  const failedFiles = input.snapshot.recentFailedFiles
    .map((entry) => `${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`)
    .join(", ");
  const changedFiles = input.snapshot.recentChangedFiles.join(", ");
  const verifiedFiles = input.snapshot.recentVerifiedFiles.join(", ");
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

  const lines: string[] = [];
  if (!input.printMode) {
    lines.push("");
  }
  lines.push("Result");
  lines.push("- Outcome: stopped");
  lines.push(`- Session: ${input.sessionId}`);
  lines.push(`- Status: ${input.summary.status}`);
  if (input.summary.durableStatus) {
    lines.push(`- DurableStatus: ${input.summary.durableStatus}`);
  }
  if (input.summary.runPhase) {
    lines.push(`- RunPhase: ${input.summary.runPhase}`);
  }
  lines.push("- TerminalState: stopped");
  lines.push(`- BlockerKind: ${blockerKind}`);
  lines.push(`- Reason: ${reason}`);
  if (changedFiles) {
    lines.push(`- Changed files: ${changedFiles}`);
  }
  if (verifiedFiles) {
    lines.push(`- Verified files: ${verifiedFiles}`);
  }
  if (failedFiles) {
    lines.push(`- Failed files: ${failedFiles}`);
  }
  if (input.snapshot.lastWriterStarted !== undefined) {
    lines.push(
      `- Writer started: ${input.snapshot.lastWriterStarted ? "yes" : "no"}`,
    );
  }
  if (input.snapshot.lastWriteEffect) {
    lines.push(`- Write effect: ${input.snapshot.lastWriteEffect}`);
  }
  if (input.snapshot.lastWriteRequiresUserInspection !== undefined) {
    lines.push(
      `- Requires inspection: ${input.snapshot.lastWriteRequiresUserInspection ? "yes" : "no"}`,
    );
  }
  if (input.snapshot.lastFailureHandoffDiagnostic) {
    lines.push(
      `- Failure handoff: ${truncate(input.snapshot.lastFailureHandoffDiagnostic, 220)}`,
    );
  }
  if (
    input.snapshot.lastWriterStarted ||
    blockerKind === "partial-mutation-failed"
  ) {
    lines.push("- Rollback: not attempted");
  }
  lines.push(`- DoNext: ${doNext}`);
  lines.push(
    `- Next action: Use /continue <follow-up prompt> or provide a concrete repair instruction to continue session ${input.sessionId}.`,
  );
  if (!input.printMode) {
    lines.push("");
  }
  return lines;
}

function formatSessionStateLabels(summary: SessionReentrySummary): string {
  const labels: string[] = [];
  if (summary.durableStatus) {
    labels.push(`durable=${summary.durableStatus}`);
  }
  if (summary.runPhase && summary.runPhase !== "idle") {
    labels.push(`phase=${summary.runPhase}`);
  }
  if (summary.terminalClassification) {
    labels.push(`terminal=${summary.terminalClassification}`);
  }
  return labels.length > 0 ? ` ${labels.join(" ")}` : "";
}

function toRelativeTime(iso: string): string {
  const updatedAt = new Date(iso).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
