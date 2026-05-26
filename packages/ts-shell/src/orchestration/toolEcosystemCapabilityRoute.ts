import type { ToolExecutionResult } from "../tools/types.js";
import type { RuntimeReceiptProjection } from "../core/runtime/runtimeReceiptProjection.js";
import { projectToolLifecycle } from "../core/tools/toolLifecycleProjection.js";
import { projectToolResult } from "../core/tools/toolResultProjection.js";
import {
  buildApprovalDeniedResult,
  buildCompletedToolResult,
  buildExecutionFailedResult,
  buildPolicyBlockedResult,
  buildUnavailableResult,
  type ToolExecutionState,
  type ToolPolicyResultReceipt,
  type ToolPolicyState,
  type ToolRedactionState,
  type ToolResultState,
} from "../core/tools/toolPolicyResult.js";
import { aggregateTurnReceipts } from "./turnReceiptAggregation.js";
import { projectTurnCapabilityPlan } from "./turnCapabilityPlan.js";

export type ToolEcosystemIntentKind =
  | "code-workspace-tool"
  | "command-runtime-tool"
  | "mcp-local-tool"
  | "mcp-external-tool"
  | "browser-observation"
  | "browser-action"
  | "unsupported-external-action"
  | "blocked-unsafe-action";

export type ToolEvidenceSource =
  | "local-deterministic"
  | "focused-fixture"
  | "external-live"
  | "external-unavailable"
  | "blocked-unsafe"
  | "not-proven";

export type ToolResultRelevance =
  | "context-evidence"
  | "planning-fact"
  | "verification-support"
  | "verification-rejected"
  | "missing-facts"
  | "irrelevant";

export interface ToolEcosystemTaskInput {
  readonly taskId: string;
  readonly intentKind: ToolEcosystemIntentKind;
  readonly toolName: string;
  readonly evidenceSource: ToolEvidenceSource;
  readonly result: ToolExecutionResult;
  readonly relevance: ToolResultRelevance;
  readonly serverName?: string;
  readonly providerIdentity?: string;
  readonly inputSummary?: string;
  readonly outputClaim?: string;
  readonly sessionCarryForward?: boolean;
  readonly notProvenClaims?: readonly string[];
}

export interface ToolEcosystemReceipt {
  readonly receiptId: string;
  readonly taskId: string;
  readonly toolKind: ToolEcosystemIntentKind;
  readonly toolName: string;
  readonly evidenceSource: ToolEvidenceSource;
  readonly serverName?: string;
  readonly providerIdentity?: string;
  readonly inputSummary: string;
  readonly policyDecision: ToolPolicyState;
  readonly executionStatus: ToolExecutionState;
  readonly resultState: ToolResultState;
  readonly failureClass: string;
  readonly outputSummary: string;
  readonly relevance: ToolResultRelevance;
  readonly redactionStatus: ToolRedactionState;
  readonly sessionCarryForward: boolean;
  readonly localEvidenceOnly: boolean;
  readonly externalLiveClaim: boolean;
  readonly runtimeDerived: boolean;
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface ToolPlanningIntegration {
  readonly facts: readonly string[];
  readonly missingFacts: readonly string[];
  readonly evidence: readonly string[];
}

export interface ToolVerificationIntegration {
  readonly status: "supported" | "rejected" | "blocked" | "not-requested";
  readonly relevantReceiptIds: readonly string[];
  readonly rejectedReceiptIds: readonly string[];
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface ToolSessionContinuationEvidence {
  readonly resultHandoffSummary: string;
  readonly transcriptSafeTurnSummary: string;
  readonly evidenceIds: readonly string[];
  readonly redaction: "clean" | "redacted";
  readonly resultState: "completed" | "stopped" | "failed";
  readonly doNextSummary?: string;
}

export interface ToolEcosystemCapabilityResult {
  readonly status: "COMPLETE" | "PARTIAL" | "BLOCKED";
  readonly receipts: readonly ToolEcosystemReceipt[];
  readonly planningIntegration: ToolPlanningIntegration;
  readonly verificationIntegration: ToolVerificationIntegration;
  readonly sessionContinuation: ToolSessionContinuationEvidence;
  readonly finalVerdict: "tool-evidence-ready" | "tool-evidence-partial" | "tool-evidence-blocked";
  readonly notProvenClaims: readonly string[];
  readonly negativeControls: {
    readonly localFixtureNotExternalLive: boolean;
    readonly unsupportedActionBlocked: boolean;
    readonly irrelevantToolSuccessRejected: boolean;
    readonly unavailableExternalMcpNotSuccess: boolean;
    readonly browserSideEffectWithoutPolicyBlocked: boolean;
  };
  readonly evidence: readonly string[];
}

export function classifyToolIntent(toolName: string): ToolEcosystemIntentKind {
  if (toolName === "read" || toolName === "glob" || toolName === "git-status" || toolName === "git-diff") {
    return "code-workspace-tool";
  }
  if (toolName === "bash") return "command-runtime-tool";
  if (toolName.startsWith("mcp__external")) return "mcp-external-tool";
  if (toolName.startsWith("mcp__")) return "mcp-local-tool";
  if (toolName === "browser.observe" || toolName === "browser.extract") return "browser-observation";
  if (toolName === "browser.click" || toolName === "browser.type") return "browser-action";
  if (toolName.startsWith("external.")) return "unsupported-external-action";
  return "blocked-unsafe-action";
}

export function runToolEcosystemCapabilityRoute(input: {
  readonly routeId?: string;
  readonly tasks: readonly ToolEcosystemTaskInput[];
  readonly verificationClaim?: string;
}): ToolEcosystemCapabilityResult {
  const routeId = input.routeId ?? "route227g";
  const receipts = input.tasks.map((task) => buildToolEcosystemReceipt({ routeId, task }));
  const planningIntegration = buildToolPlanningIntegration(receipts);
  const verificationIntegration = buildToolVerificationIntegration({
    receipts,
    claim: input.verificationClaim ?? "tool evidence can support task result only when relevant and provenance-backed",
  });
  const sessionContinuation = buildToolSessionContinuation(receipts);
  const negativeControls = {
    localFixtureNotExternalLive: receipts
      .filter((receipt) => receipt.localEvidenceOnly)
      .every((receipt) => receipt.externalLiveClaim === false),
    unsupportedActionBlocked: receipts.some((receipt) =>
      (receipt.toolKind === "unsupported-external-action" || receipt.toolKind === "blocked-unsafe-action") &&
      receipt.resultState === "stopped" &&
      receipt.policyDecision !== "allowed"
    ),
    irrelevantToolSuccessRejected: receipts.some((receipt) =>
      receipt.resultState === "completed" &&
      receipt.relevance === "irrelevant" &&
      verificationIntegration.rejectedReceiptIds.includes(receipt.receiptId)
    ),
    unavailableExternalMcpNotSuccess: receipts.some((receipt) =>
      receipt.toolKind === "mcp-external-tool" &&
      receipt.evidenceSource === "external-unavailable" &&
      receipt.resultState !== "completed"
    ),
    browserSideEffectWithoutPolicyBlocked: receipts.some((receipt) =>
      receipt.toolKind === "browser-action" &&
      receipt.policyDecision === "blocked" &&
      receipt.executionStatus === "not-run"
    ),
  };
  const notProvenClaims = uniqueStable([
    ...receipts.flatMap((receipt) => receipt.notProvenClaims),
    ...(receipts.some((receipt) => receipt.evidenceSource === "external-live")
      ? []
      : ["external-live tool execution"]),
  ]);
  const complete =
    receipts.length >= 4 &&
    receipts.some((receipt) => receipt.toolKind === "mcp-local-tool" || receipt.toolKind === "mcp-external-tool") &&
    receipts.some((receipt) => receipt.toolKind === "browser-observation" || receipt.toolKind === "browser-action") &&
    planningIntegration.facts.length > 0 &&
    verificationIntegration.status === "supported" &&
    Object.values(negativeControls).every(Boolean) &&
    sessionContinuation.evidenceIds.some((entry) => entry.startsWith("tool-ecosystem:receipt:"));
  const blocked = receipts.length === 0 || receipts.every((receipt) => receipt.resultState === "stopped");
  const status = complete ? "COMPLETE" : blocked ? "BLOCKED" : "PARTIAL";

  return {
    status,
    receipts,
    planningIntegration,
    verificationIntegration,
    sessionContinuation,
    finalVerdict:
      status === "COMPLETE"
        ? "tool-evidence-ready"
        : status === "BLOCKED"
          ? "tool-evidence-blocked"
          : "tool-evidence-partial",
    notProvenClaims,
    negativeControls,
    evidence: [
      `tool-ecosystem:${routeId}:status:${status.toLowerCase()}`,
      `tool-ecosystem:receipts:${receipts.length}`,
      `tool-ecosystem:planning-facts:${planningIntegration.facts.length}`,
      `tool-ecosystem:verification:${verificationIntegration.status}`,
      `tool-ecosystem:session-result:${sessionContinuation.resultState}`,
      ...receipts.flatMap((receipt) => receipt.evidence),
      ...planningIntegration.evidence,
      ...verificationIntegration.evidence,
      "tool-ecosystem:local-fixture-not-external-live",
      "tool-ecosystem:unsupported-actions-blocked",
      "tool-ecosystem:not-proven-visible",
    ],
  };
}

function buildToolEcosystemReceipt(input: {
  readonly routeId: string;
  readonly task: ToolEcosystemTaskInput;
}): ToolEcosystemReceipt {
  const projection = projectToolLifecycle({
    toolName: input.task.toolName,
    ...input.task.result,
  });
  const policyReceipt = policyReceiptForTask(input.task, projection.failureBoundary);
  const projected = projectToolResult(policyReceipt);
  const runtimeReceipt = runtimeReceiptProjection(input.task.result.metadata?.runtimeReceipt);
  const resultState = policyReceipt.result;
  const externalLiveClaim = input.task.evidenceSource === "external-live";
  const localEvidenceOnly =
    input.task.evidenceSource === "local-deterministic" ||
    input.task.evidenceSource === "focused-fixture";
  const receiptId = `${input.routeId}:${input.task.taskId}:${normalizeId(input.task.toolName)}`;
  const notProvenClaims = uniqueStable([
    ...(externalLiveClaim ? [] : [`external-live ${input.task.toolName}`]),
    ...(input.task.notProvenClaims ?? []),
  ]);
  return {
    receiptId,
    taskId: input.task.taskId,
    toolKind: input.task.intentKind,
    toolName: input.task.toolName,
    evidenceSource: input.task.evidenceSource,
    ...(input.task.serverName ? { serverName: input.task.serverName } : {}),
    ...(input.task.providerIdentity ? { providerIdentity: input.task.providerIdentity } : {}),
    inputSummary: sanitizeSummary(input.task.inputSummary ?? input.task.toolName, 180),
    policyDecision: policyReceipt.policy,
    executionStatus: policyReceipt.execution,
    resultState,
    failureClass: projection.failureBoundary ?? "none",
    outputSummary: runtimeReceipt?.resultSummary ?? projected.resultSummary,
    relevance: input.task.relevance,
    redactionStatus: runtimeReceipt?.redactionStatus ?? projected.redactionStatus,
    sessionCarryForward:
      input.task.sessionCarryForward ?? (resultState !== "completed" || input.task.relevance !== "irrelevant"),
    localEvidenceOnly,
    externalLiveClaim,
    runtimeDerived: Boolean(runtimeReceipt) || input.task.result.success || Boolean(input.task.result.error),
    notProvenClaims,
    evidence: [
      `tool-ecosystem:receipt:${receiptId}`,
      `tool-ecosystem:intent:${input.task.intentKind}`,
      `tool-ecosystem:source:${input.task.evidenceSource}`,
      `tool-ecosystem:policy:${policyReceipt.policy}`,
      `tool-ecosystem:execution:${policyReceipt.execution}`,
      `tool-ecosystem:result:${resultState}`,
      `tool-ecosystem:relevance:${input.task.relevance}`,
      localEvidenceOnly ? "tool-ecosystem:local-evidence-only" : "tool-ecosystem:nonlocal-evidence",
      externalLiveClaim ? "tool-ecosystem:external-live-claim" : "tool-ecosystem:no-external-live-claim",
      ...(runtimeReceipt ? runtimeReceipt.evidenceSummary : []),
      ...(Array.isArray(input.task.result.metadata?.evidence)
        ? input.task.result.metadata.evidence.filter((entry): entry is string => typeof entry === "string")
        : []),
    ],
  };
}

function policyReceiptForTask(
  task: ToolEcosystemTaskInput,
  failureBoundary: string | undefined,
): ToolPolicyResultReceipt {
  const reason = task.result.error ?? task.result.output ?? `${task.toolName} completed without output`;
  const base = {
    capability: capabilityForIntent(task.intentKind),
    label: task.toolName,
    reason: sanitizeSummary(reason),
    evidence: [`tool-ecosystem:task:${task.taskId}`],
  } as const;
  if (task.result.success) {
    return buildCompletedToolResult(base);
  }
  if (failureBoundary === "approval-denied") {
    return buildApprovalDeniedResult(base);
  }
  if (
    failureBoundary === "permission-blocked" ||
    task.intentKind === "browser-action" ||
    task.intentKind === "unsupported-external-action" ||
    task.intentKind === "blocked-unsafe-action"
  ) {
    return buildPolicyBlockedResult({
      ...base,
      reasonCode: failureBoundary ?? "policy-blocked",
      doNext: "Keep unsupported or side-effecting tool actions blocked until an explicit policy allows them.",
    });
  }
  if (failureBoundary === "tool-unavailable" || failureBoundary === "mcp-unavailable") {
    return buildUnavailableResult({
      ...base,
      availability: task.intentKind === "mcp-external-tool" ? "not-configured" : "unavailable",
      reasonCode: failureBoundary,
    });
  }
  return buildExecutionFailedResult({
    ...base,
    reasonCode: failureBoundary ?? "tool-execution-failed",
  });
}

function buildToolPlanningIntegration(
  receipts: readonly ToolEcosystemReceipt[],
): ToolPlanningIntegration {
  const usable = receipts.filter((receipt) =>
    (receipt.relevance === "context-evidence" || receipt.relevance === "planning-fact") &&
    receipt.resultState === "completed"
  );
  const missingFacts = receipts
    .filter((receipt) => receipt.resultState !== "completed" && receipt.relevance === "missing-facts")
    .map((receipt) => `${receipt.toolName}:${receipt.failureClass}`);
  return {
    facts: usable.map((receipt) => `${receipt.toolName}:${receipt.evidenceSource}:${receipt.receiptId}`),
    missingFacts,
    evidence: [
      `tool-planning:usable-receipts:${usable.length}`,
      `tool-planning:missing-facts:${missingFacts.length}`,
      "tool-planning:provenance-required",
    ],
  };
}

function buildToolVerificationIntegration(input: {
  readonly receipts: readonly ToolEcosystemReceipt[];
  readonly claim: string;
}): ToolVerificationIntegration {
  const relevant = input.receipts.filter((receipt) =>
    receipt.relevance === "verification-support" &&
    receipt.resultState === "completed" &&
    receipt.redactionStatus !== "failed"
  );
  const rejected = input.receipts.filter((receipt) =>
    receipt.relevance === "verification-rejected" ||
    receipt.relevance === "irrelevant" ||
    (receipt.relevance === "verification-support" && receipt.resultState !== "completed")
  );
  const blocked = input.receipts.some((receipt) =>
    receipt.resultState === "stopped" && receipt.relevance === "missing-facts"
  );
  if (relevant.length > 0) {
    return {
      status: "supported",
      relevantReceiptIds: relevant.map((receipt) => receipt.receiptId),
      rejectedReceiptIds: rejected.map((receipt) => receipt.receiptId),
      reason: `${input.claim}; supported receipts=${relevant.length}; rejected receipts=${rejected.length}`,
      evidence: [
        "tool-verification:supported-by-relevant-receipt",
        `tool-verification:rejected:${rejected.length}`,
      ],
    };
  }
  return {
    status: blocked ? "blocked" : rejected.length > 0 ? "rejected" : "not-requested",
    relevantReceiptIds: [],
    rejectedReceiptIds: rejected.map((receipt) => receipt.receiptId),
    reason: `${input.claim}; no completed relevant receipt`,
    evidence: [
      `tool-verification:${blocked ? "blocked" : rejected.length > 0 ? "rejected" : "not-requested"}`,
      `tool-verification:rejected:${rejected.length}`,
    ],
  };
}

function buildToolSessionContinuation(
  receipts: readonly ToolEcosystemReceipt[],
): ToolSessionContinuationEvidence {
  const carriedReceipts = receipts.filter((receipt) => receipt.sessionCarryForward);
  const policyReceipts = carriedReceipts.map((receipt) =>
    receipt.resultState === "completed"
      ? buildCompletedToolResult({
          capability: capabilityForIntent(receipt.toolKind),
          label: receipt.toolName,
          reason: receipt.outputSummary,
          evidence: receipt.evidence,
        })
      : buildPolicyBlockedResult({
          capability: capabilityForIntent(receipt.toolKind),
          label: receipt.toolName,
          reasonCode: receipt.failureClass,
          reason: receipt.outputSummary,
          evidence: receipt.evidence,
        }),
  );
  const aggregate = aggregateTurnReceipts({
    plan: projectTurnCapabilityPlan({
      taskKind: "run-command",
      directCommand: "tool ecosystem evidence route",
      blockedReason: receipts.some((receipt) => receipt.resultState === "stopped")
        ? "one or more tool receipts stopped before successful execution"
        : undefined,
      continuationLineage: carriedReceipts.map((receipt) => receipt.receiptId),
    }),
    toolReceipts: policyReceipts,
    evidence: carriedReceipts.flatMap((receipt) => receipt.evidence),
    observations: carriedReceipts.map((receipt) =>
      `${receipt.toolName}:${receipt.evidenceSource}:${receipt.relevance}`,
    ),
    doNext: "Carry tool receipt provenance into the next turn without upgrading local or blocked evidence.",
  });
  return aggregate;
}

function capabilityForIntent(intent: ToolEcosystemIntentKind): ToolPolicyResultReceipt["capability"] {
  switch (intent) {
    case "code-workspace-tool":
      return "tool";
    case "command-runtime-tool":
      return "command";
    case "mcp-local-tool":
    case "mcp-external-tool":
      return "mcp";
    case "browser-observation":
    case "browser-action":
      return "browser";
    case "unsupported-external-action":
    case "blocked-unsafe-action":
      return "tool";
  }
}

function runtimeReceiptProjection(value: unknown): RuntimeReceiptProjection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<RuntimeReceiptProjection>;
  if (
    typeof candidate.resultSummary === "string" &&
    Array.isArray(candidate.evidenceSummary) &&
    typeof candidate.redactionStatus === "string"
  ) {
    return candidate as RuntimeReceiptProjection;
  }
  return undefined;
}

function sanitizeSummary(value: string, maxLength = 240): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/<body[\s\S]*?<\/body>/gi, "[raw-content-excluded]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || "tool";
}

function uniqueStable(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
