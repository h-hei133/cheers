import type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js";

const unsafeContinuationEvidencePattern =
  /(raw-dom|raw DOM|<html|<\/|authorization|api[_-]?key|token|secret|cookie|private-agents-real|BEGIN [A-Z ]*PRIVATE KEY|raw-file|file-dump)/i;

export function isReplaySafeContinuationEvidence(entry: string): boolean {
  return (
    entry.trim().length > 0 &&
    !unsafeContinuationEvidencePattern.test(entry)
  );
}

export function selectContinuationEvidenceForSnapshot(
  evidence: readonly string[],
): string[] {
  const safeEvidence = evidence.filter(isReplaySafeContinuationEvidence);
  if (safeEvidence.length <= 8) {
    return [...safeEvidence];
  }

  const keep = safeEvidence.slice(0, 8);
  const criticalPrefixes = [
    "repair-remaining-files:",
    "repair-failed-files:",
    "repair-processed-files:",
    "repair-skipped-files:",
    "repair-outcome:",
    "transform:",
    "replan-transform:",
    "rebind-transform:",
    "rebind-blocker:",
    "verify-command-hint:",
    "verify-target-hint:",
    "verify-cwd-hint:",
    "verify-resume-eligible:",
    "verify-blocker-kind:",
    "verify-next-action:",
    "reopen-candidates:",
    "why-not-auto-select:",
    "blocked-disambiguation",
    "reopen-target:",
    "reopen-reason:",
    "current-request-scope-cache-key:",
    "current-request-scope-label:",
    "current-request-scope-project-root:",
    "current-request-scope-source:",
    "current-permission-request-tool:",
    "current-permission-request-operation:",
    "current-permission-request-target:",
    "current-permission-request-process:",
    "current-permission-request-scope-key:",
    "current-permission-request-scope-label:",
    "current-permission-request-cache-key:",
    "current-permission-request-project-root:",
    "current-permission-request-source:",
    "current-permission-request-lineage:",
    "browser-agent-transaction-trace:",
    "browser-agent-transaction:",
    "browser-agent-observation:",
    "browser-observation:",
    "browser-agent-result:",
    "browser-agent-reason:",
    "claim-ledger ",
    "claim-ledger:",
  ];

  for (const entry of safeEvidence) {
    const lowered = entry.toLowerCase();
    if (
      criticalPrefixes.some((prefix) => lowered.startsWith(prefix)) &&
      !keep.includes(entry)
    ) {
      keep.push(entry);
    }
  }

  return keep.slice(0, 16);
}

export function hasContinuationEvidence(snapshot: RecoverySnapshot): boolean {
  const hasPendingPrompt =
    typeof snapshot.pendingPrompt === "string" &&
    snapshot.pendingPrompt.trim().length > 0;
  const hasActiveRunPhase =
    snapshot.runPhase === "prompt-persisted" ||
    snapshot.runPhase === "turn-active";
  const hasPendingLifecycle =
    Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
    Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0;

  return hasPendingPrompt || hasActiveRunPhase || hasPendingLifecycle;
}

export function hasDeterministicTerminalEvidence(
  snapshot: RecoverySnapshot,
): boolean {
  if (snapshot.durableStatus) {
    return true;
  }

  if (snapshot.terminalClassification || snapshot.terminalReason) {
    return true;
  }

  return (
    snapshot.lastLifecycleEvent?.event === "run-completed" ||
    snapshot.lastLifecycleEvent?.event === "run-error" ||
    snapshot.lastLifecycleEvent?.event === "run-terminated"
  );
}
