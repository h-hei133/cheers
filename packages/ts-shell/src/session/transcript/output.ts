import { isRecord } from "../../core/values/record.js";

const ROLES = new Set<unknown>(["planner", "coder", "reviewer"]);
const TERMINALS = new Set<unknown>(["completed", "stopped_cycle", "stopped_max_turns", "stopped_invalid_handoff", "stopped_not_proven", "stopped_error"]);
const VERIFICATION = new Set<unknown>(["passed", "failed", "blocked", "skipped", "not-requested"]);

function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function optionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => value[key] === undefined || typeof value[key] === "string");
}

function files(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => isRecord(item) && typeof item.path === "string" && typeof item.reason === "string");
}

function verification(value: unknown): boolean {
  return isRecord(value) && VERIFICATION.has(value.status) && optionalStrings(value, ["command", "reason", "nextAction", "blockerKind", "selectionScope", "selectionSource"]);
}

function seed(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !optionalStrings(value, ["actionKind", "target", "reason", "blockerKind"])) return false;
  return (value.changedFiles === undefined || strings(value.changedFiles)) &&
    (value.verifiedFiles === undefined || strings(value.verifiedFiles)) &&
    (value.writerStarted === undefined || typeof value.writerStarted === "boolean") &&
    (value.requiresUserInspection === undefined || typeof value.requiresUserInspection === "boolean") &&
    (value.writeEffect === undefined || (typeof value.writeEffect === "string" && ["none", "unknown", "unverified", "verified"].includes(value.writeEffect))) &&
    (value.verification === undefined || (isRecord(value.verification) &&
      (value.verification.status === undefined || VERIFICATION.has(value.verification.status)) &&
      optionalStrings(value.verification, ["command", "reason", "blockerKind"])));
}

function provenance(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && ["approvalDecisions", "toolExecutions"].every(key => {
    const entries = value[key];
    return entries === undefined || (Array.isArray(entries) && entries.every(item => isRecord(item) &&
      ["kind", "source", "toolName", "taskId"].every(field => typeof item[field] === "string") && optionalStrings(item, ["failureBoundary"])));
  });
}

/** Fields consumed by recovery/continuity; opaque result extensions stay opaque. */
function codingResult(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || typeof value.taskKind !== "string" || !optionalStrings(value, ["failureBoundary"]) ||
    !["changedFiles", "verifiedFiles", "evidence"].every(key => strings(value[key])) || !files(value.failedFiles) || !files(value.unverifiedFiles)) return false;
  const { changeSet, taskSatisfaction, repair, continuation, diagnosis, recoverySurface } = value;
  if (!isRecord(changeSet) || !["attemptedFiles", "changedFiles", "preExistingDirtyFiles", "postRunDirtyFiles", "unchangedAttemptedFiles"].every(key => strings(changeSet[key]))) return false;
  if (!isRecord(taskSatisfaction) || typeof taskSatisfaction.verdict !== "string" ||
    !["requiredEvidence", "observedEvidence", "reasons"].every(key => strings(taskSatisfaction[key]))) return false;
  if (!isRecord(repair) || typeof repair.status !== "string" || !["not-needed", "recovered", "failed"].includes(repair.status) ||
    !Number.isInteger(repair.attempts) || Number(repair.attempts) < 0 || !["notes", "recoveredItems", "failedItems"].every(key => strings(repair[key]))) return false;
  if (!isRecord(continuation) || typeof continuation.status !== "string" || !["first-pass-success", "recovered-after-continuation", "failed-after-bounded-continuation"].includes(continuation.status) ||
    !Number.isInteger(continuation.attempts) || Number(continuation.attempts) < 0 || !strings(continuation.evidence)) return false;
  if (diagnosis !== undefined && (!isRecord(diagnosis) || typeof diagnosis.disposition !== "string" ||
    !optionalStrings(diagnosis, ["reason", "searchPattern"]) || !strings(diagnosis.candidateFiles) || !strings(diagnosis.evidenceFiles))) return false;
  if (recoverySurface !== undefined && (!isRecord(recoverySurface) || typeof recoverySurface.explicitRestoreAvailable !== "boolean" ||
    typeof recoverySurface.userFacingMessage !== "string" || !strings(recoverySurface.evidence))) return false;
  return verification(value.verification) && seed(value.lastActionResultSeed) && provenance(value.provenance);
}

export function readableToolEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (!value.type.startsWith("tool.") && !value.type.startsWith("approval.")) return true;
  return typeof value.toolName === "string" && typeof value.taskId === "string" &&
    optionalStrings(value, ["failureReason", "output", "chunk"]) &&
    (value.success === undefined || typeof value.success === "boolean") &&
    (value.coveredFiles === undefined || strings(value.coveredFiles)) &&
    (value.outcome === undefined || value.outcome === "approved" || value.outcome === "denied");
}

export function readableOutput(value: unknown): boolean {
  return isRecord(value) && ROLES.has(value.role) && typeof value.content === "string" &&
    (value.handoffTo === undefined || ROLES.has(value.handoffTo)) && optionalStrings(value, ["handoffReason"]) &&
    (value.notes === undefined || strings(value.notes)) && codingResult(value.codingResult) &&
    (value.events === undefined || (Array.isArray(value.events) && value.events.every(readableToolEvent)));
}

export function readableQueryResult(value: unknown): boolean {
  if (!isRecord(value) || !TERMINALS.has(value.status) || !TERMINALS.has(value.terminalReason) ||
    typeof value.terminalClassification !== "string" || !["success", "stopped", "error"].includes(value.terminalClassification) || typeof value.finalOutput !== "string" ||
    !optionalStrings(value, ["stopReason", "lastContinuationReason"]) || !codingResult(value.codingResult)) return false;
  const context = value.sharedContext;
  return Array.isArray(value.transcript) && value.transcript.every(readableOutput) && isRecord(context) &&
    typeof context.sessionId === "string" && typeof context.initialPrompt === "string" && strings(context.notes) &&
    Array.isArray(context.handoffs) && context.handoffs.every(item => isRecord(item) && ROLES.has(item.from) && ROLES.has(item.to) &&
      typeof item.reason === "string" && Number.isInteger(item.turn) && Number(item.turn) >= 0);
}
