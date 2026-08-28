import { sanitizeBrowserText } from "./browserCapabilityModel.js";
export type { BrowserTxnTrace, BrowserTxnTraceStep } from "./browserTxnTypes.js";
import type {
  BrowserTxnResult,
  BrowserTxnStatus,
  BrowserTxnStepSummary,
  BrowserTxnTrace,
  BrowserTxnTraceStep,
} from "./browserTxnTypes.js";

export function createBrowserTxnTrace(result: Omit<BrowserTxnResult, "trace">): BrowserTxnTrace {
  const steps = result.stepSummaries.map(traceStep);
  const repairEvidence = result.evidence
    .filter((entry) => entry.startsWith("browser-repair:"))
    .map((entry) => sanitizeBrowserText(entry, 160));
  const cleanupEvidence = result.evidence
    .filter((entry) => entry.startsWith("browser-transaction:cleanup:"))
    .map((entry) => sanitizeBrowserText(entry, 120));
  const redactionEvidence = result.evidence
    .filter((entry) =>
      entry.includes("redacted") ||
      entry.includes("redaction") ||
      entry.includes("raw-dom-excluded") ||
      entry.includes("no-secrets") ||
      entry.includes("typed-value-redacted")
    )
    .map((entry) => sanitizeBrowserText(entry, 160));

  return {
    traceId: stableTraceId([
      result.evidenceId,
      result.transactionId,
      result.status,
      result.reasonCode,
      result.cleanupStatus,
      result.repairStatus,
      result.finalSummary,
    ].join("|")),
    transactionId: result.transactionId,
    evidenceId: result.evidenceId,
    controlledTarget: sanitizeBrowserText(result.controlledTarget, 180),
    plan: {
      sequence: result.plannedSteps,
      plannerConfidence: result.planner.confidence,
      plannerReason: sanitizeBrowserText(result.planner.reason, 180),
      repairAllowed: result.planner.repairAllowed,
      policyLevel: result.planner.requiredPolicyLevel,
    },
    steps,
    observations: steps
      .filter((step) => step.phase === "observation" || step.phase === "extraction")
      .map((step) => `${step.kind}:${step.status}:${step.reasonCode}:${sanitizeBrowserText(step.summary, 140)}`),
    actions: steps
      .filter((step) => step.phase === "action")
      .map((step) => `${step.kind}:${step.status}:${step.reasonCode}:${sanitizeBrowserText(step.target, 80)}`),
    repair: {
      status: result.repairStatus,
      attempted: result.repairStatus === "attempted" ||
        result.repairStatus === "succeeded" ||
        result.repairStatus === "failed",
      evidence: repairEvidence,
    },
    final: {
      status: result.status,
      summary: sanitizeBrowserText(result.finalSummary, 420),
      reasonCode: sanitizeBrowserText(result.reasonCode, 80),
    },
    cleanup: {
      status: sanitizeBrowserText(result.cleanupStatus, 40),
      evidence: cleanupEvidence,
    },
    redaction: {
      status: sanitizeBrowserText(result.redactionStatus, 40),
      evidence: redactionEvidence,
    },
    timing: {
      durationMs: Math.max(0, Math.floor(result.durationMs)),
      budget: "bounded-transaction",
    },
    boundaries: [
      "no-provider-or-model-call",
      "controlled-local-only",
      "no-public-web-default",
      "no-auth-session-persistence",
      "raw-dom-excluded",
      "no-secrets",
      "no-image-capture-default",
      "no-mcp-live-backend",
      "no-cross-session-page-persistence",
    ],
  };
}

export function summarizeBrowserTxnTrace(trace: BrowserTxnTrace): string {
  return sanitizeBrowserText([
    `trace=${trace.traceId}`,
    `transaction=${trace.transactionId}`,
    `status=${trace.final.status}`,
    `reason=${trace.final.reasonCode}`,
    `repair=${trace.repair.status}`,
    `cleanup=${trace.cleanup.status}`,
    `redaction=${trace.redaction.status}`,
    `summary=${trace.final.summary}`,
  ].join(" "), 520);
}

export function browserTxnTraceEvidenceLine(trace: BrowserTxnTrace): string {
  return [
    "browser-agent-transaction-trace",
    trace.traceId,
    trace.transactionId,
    trace.final.status,
    trace.final.reasonCode,
    trace.repair.status,
    trace.cleanup.status,
    trace.redaction.status,
    sanitizeBrowserText(trace.final.summary, 160),
  ].join(":");
}

function traceStep(step: BrowserTxnStepSummary, index: number): BrowserTxnTraceStep {
  return {
    index: index + 1,
    kind: sanitizeBrowserText(step.kind, 40),
    phase: phaseForStep(step.kind),
    status: step.status,
    target: sanitizeBrowserText(step.target, 120),
    summary: sanitizeBrowserText(step.summary, 240),
    reasonCode: sanitizeBrowserText(step.reasonCode, 80),
    repairStatus: step.repairStatus,
  };
}

function phaseForStep(kind: string): BrowserTxnTraceStep["phase"] {
  if (kind === "click" || kind === "type") {
    return "action";
  }
  if (kind === "extract") {
    return "extraction";
  }
  return "observation";
}

function stableTraceId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `browser-txn-trace-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
