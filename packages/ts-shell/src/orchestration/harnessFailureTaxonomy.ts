export type HarnessFailureClass =
  | "missing-target"
  | "missing-context"
  | "low-plan-quality"
  | "context-budget-limited"
  | "provider-unavailable"
  | "provider-invalid-output"
  | "verification-not-allowlisted"
  | "verification-failed"
  | "runtime-timeout"
  | "runtime-blocked"
  | "edit-preflight-stopped"
  | "edit-partial-failure"
  | "repair-proposal-invalid"
  | "session-result-parity-risk"
  | "unknown";

export interface HarnessFailureTaxonomyEntry {
  readonly failureClass: HarnessFailureClass;
  readonly capabilityArea:
    | "workspace-file-context"
    | "agent-loop"
    | "provider-model"
    | "runtime-verification"
    | "edit-patch"
    | "result-surface"
    | "session-continue"
    | "unknown";
  readonly lifecycleStage:
    | "read"
    | "plan"
    | "proposal"
    | "verification"
    | "repair"
    | "result"
    | "session"
    | "unknown";
  readonly safeReason: string;
  readonly suggestedNextAction: string;
  readonly verifierMarker: string;
}

const TAXONOMY: Record<HarnessFailureClass, HarnessFailureTaxonomyEntry> = {
  "missing-target": {
    failureClass: "missing-target",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "read",
    safeReason: "No explicit in-workspace target was available.",
    suggestedNextAction: "Ask for or resolve one explicit in-workspace target.",
    verifierMarker: "harness-failure:missing-target",
  },
  "missing-context": {
    failureClass: "missing-context",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "plan",
    safeReason: "Required context packet, graph, or Agent Plan facts are missing.",
    suggestedNextAction: "Build targeted context packet, graph, and Agent Plan facts first.",
    verifierMarker: "harness-failure:missing-context",
  },
  "low-plan-quality": {
    failureClass: "low-plan-quality",
    capabilityArea: "agent-loop",
    lifecycleStage: "plan",
    safeReason: "Plan quality did not reach the required deterministic readiness level.",
    suggestedNextAction: "Read the suggested context or add verification facts before proceeding.",
    verifierMarker: "harness-failure:low-plan-quality",
  },
  "context-budget-limited": {
    failureClass: "context-budget-limited",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "plan",
    safeReason: "Context graph omitted required candidates because of a budget.",
    suggestedNextAction: "Reduce or summarize context before downstream planning.",
    verifierMarker: "harness-failure:context-budget-limited",
  },
  "provider-unavailable": {
    failureClass: "provider-unavailable",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider proposal generation was unavailable or not opted in.",
    suggestedNextAction: "Use a deterministic fake provider or explicit isolated provider gate.",
    verifierMarker: "harness-failure:provider-unavailable",
  },
  "provider-invalid-output": {
    failureClass: "provider-invalid-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output could not be normalized into a safe proposal.",
    suggestedNextAction: "Request a bounded exact proposal tied to context ids.",
    verifierMarker: "harness-failure:provider-invalid-output",
  },
  "verification-not-allowlisted": {
    failureClass: "verification-not-allowlisted",
    capabilityArea: "runtime-verification",
    lifecycleStage: "verification",
    safeReason: "Verification command is outside the existing allowlist.",
    suggestedNextAction: "Select an existing allowlisted verification command.",
    verifierMarker: "harness-failure:verification-not-allowlisted",
  },
  "verification-failed": {
    failureClass: "verification-failed",
    capabilityArea: "runtime-verification",
    lifecycleStage: "verification",
    safeReason: "Verification evidence reports a failed command or check.",
    suggestedNextAction: "Classify the failure and build repair context if eligible.",
    verifierMarker: "harness-failure:verification-failed",
  },
  "runtime-timeout": {
    failureClass: "runtime-timeout",
    capabilityArea: "runtime-verification",
    lifecycleStage: "verification",
    safeReason: "Runtime receipt indicates timeout.",
    suggestedNextAction: "Treat as environment/runtime evidence before retrying.",
    verifierMarker: "harness-failure:runtime-timeout",
  },
  "runtime-blocked": {
    failureClass: "runtime-blocked",
    capabilityArea: "runtime-verification",
    lifecycleStage: "verification",
    safeReason: "Runtime execution was blocked before dispatch or completion.",
    suggestedNextAction: "Resolve the runtime or policy blocker before retrying.",
    verifierMarker: "harness-failure:runtime-blocked",
  },
  "edit-preflight-stopped": {
    failureClass: "edit-preflight-stopped",
    capabilityArea: "edit-patch",
    lifecycleStage: "proposal",
    safeReason: "Edit preflight stopped before mutation.",
    suggestedNextAction: "Satisfy existing edit route preconditions.",
    verifierMarker: "harness-failure:edit-preflight-stopped",
  },
  "edit-partial-failure": {
    failureClass: "edit-partial-failure",
    capabilityArea: "edit-patch",
    lifecycleStage: "repair",
    safeReason: "Edit transaction produced a partial failure.",
    suggestedNextAction: "Use recovery or repair planning with exact evidence.",
    verifierMarker: "harness-failure:edit-partial-failure",
  },
  "repair-proposal-invalid": {
    failureClass: "repair-proposal-invalid",
    capabilityArea: "edit-patch",
    lifecycleStage: "repair",
    safeReason: "Repair proposal was invalid or unsafe for handoff.",
    suggestedNextAction: "Request a review-only exact repair proposal.",
    verifierMarker: "harness-failure:repair-proposal-invalid",
  },
  "session-result-parity-risk": {
    failureClass: "session-result-parity-risk",
    capabilityArea: "session-continue",
    lifecycleStage: "session",
    safeReason: "Session or continue summary may not preserve result truthfulness.",
    suggestedNextAction: "Project replay-safe result evidence before continuing.",
    verifierMarker: "harness-failure:session-result-parity-risk",
  },
  unknown: {
    failureClass: "unknown",
    capabilityArea: "unknown",
    lifecycleStage: "unknown",
    safeReason: "No known deterministic failure class matched.",
    suggestedNextAction: "Inspect safe evidence markers and classify the failure.",
    verifierMarker: "harness-failure:unknown",
  },
};

export function classifyHarnessFailure(input: {
  readonly status?: string;
  readonly reason?: string;
  readonly evidence?: readonly string[];
}): HarnessFailureTaxonomyEntry {
  const text = [
    input.status ?? "",
    input.reason ?? "",
    ...(input.evidence ?? []),
  ].join(" ").toLowerCase();
  if (/missing-target|target.*missing|missing target/.test(text)) return TAXONOMY["missing-target"];
  if (/budget-limited|over-budget|over-byte-budget|over-file-budget|over-node-budget/.test(text)) return TAXONOMY["context-budget-limited"];
  if (/low-plan-quality|plan-quality.*low-confidence|low-confidence/.test(text)) return TAXONOMY["low-plan-quality"];
  if (/missing-context|context-missing|context packet.*missing|agent plan.*missing/.test(text)) return TAXONOMY["missing-context"];
  if (/provider.*invalid|provider-invalid|invalid-proposal|invalid proposal|invalid output/.test(text)) return TAXONOMY["provider-invalid-output"];
  if (/provider.*not[- ]configured|provider.*opt[- ]in|provider.*required|provider.*unavailable|provider-unavailable/.test(text)) return TAXONOMY["provider-unavailable"];
  if (/not-allowlisted|allowlist:not-allowlisted/.test(text)) return TAXONOMY["verification-not-allowlisted"];
  if (/runtime.*timeout|timed-out/.test(text)) return TAXONOMY["runtime-timeout"];
  if (/runtime.*blocked|blocked-by-policy|approval-denied/.test(text)) return TAXONOMY["runtime-blocked"];
  if (/verification.*failed|verification-command-result:outcome:failed/.test(text)) return TAXONOMY["verification-failed"];
  if (/partial-failure|partial failure/.test(text)) return TAXONOMY["edit-partial-failure"];
  if (/preflight|stale-read|authority/.test(text)) return TAXONOMY["edit-preflight-stopped"];
  if (/repair.*invalid|repair-loop-proposal-invalid/.test(text)) return TAXONOMY["repair-proposal-invalid"];
  if (/session.*parity|continuation.*parity/.test(text)) return TAXONOMY["session-result-parity-risk"];
  return TAXONOMY.unknown;
}

export function getHarnessFailureTaxonomyEntry(
  failureClass: HarnessFailureClass,
): HarnessFailureTaxonomyEntry {
  return TAXONOMY[failureClass];
}
