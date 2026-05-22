export type HarnessFailureClass =
  | "missing-target"
  | "missing-context"
  | "missing-required-context"
  | "under-evidenced-analysis"
  | "stale-analysis-context"
  | "analysis-blocked-provider"
  | "analysis-blocked-verification"
  | "low-plan-quality"
  | "context-budget-limited"
  | "provider-unavailable"
  | "provider-dry-run-not-opted-in"
  | "provider-prompt-audit-failed"
  | "provider-output-malformed"
  | "provider-output-unanchored"
  | "provider-output-unsafe"
  | "provider-output-over-budget"
  | "provider-anchor-quality-low"
  | "provider-anchor-no-match"
  | "provider-anchor-ambiguous"
  | "provider-anchor-stale-context"
  | "provider-anchor-conflict"
  | "provider-anchor-unsupported-fuzzy-output"
  | "provider-anchor-unsafe-output"
  | "provider-anchor-malformed-output"
  | "provider-invalid-output"
  | "smoke-no-opt-in"
  | "smoke-provider-unavailable"
  | "smoke-prompt-audit-failed"
  | "smoke-output-invalid"
  | "smoke-anchoring-failed"
  | "smoke-unsafe-output"
  | "smoke-exact-ready-no-write"
  | "smoke-corpus-regression"
  | "live-smoke-no-opt-in"
  | "live-smoke-provider-unavailable"
  | "live-smoke-output-invalid"
  | "live-smoke-anchor-failed"
  | "live-smoke-unsafe-output"
  | "live-smoke-no-write-violation"
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
  "missing-required-context": {
    failureClass: "missing-required-context",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "read",
    safeReason: "Required task context is missing.",
    suggestedNextAction: "Read the required task context before analysis, provider, verification, or repair planning.",
    verifierMarker: "harness-failure:missing-required-context",
  },
  "under-evidenced-analysis": {
    failureClass: "under-evidenced-analysis",
    capabilityArea: "agent-loop",
    lifecycleStage: "plan",
    safeReason: "Analysis claims are missing explicit evidence or confidence is too low.",
    suggestedNextAction: "Ground analysis observations in explicit evidence ids before downstream planning.",
    verifierMarker: "harness-failure:under-evidenced-analysis",
  },
  "stale-analysis-context": {
    failureClass: "stale-analysis-context",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "plan",
    safeReason: "Analysis context has stale facts.",
    suggestedNextAction: "Refresh stale context before downstream readiness.",
    verifierMarker: "harness-failure:stale-analysis-context",
  },
  "analysis-blocked-provider": {
    failureClass: "analysis-blocked-provider",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Analysis quality blocked provider proposal readiness.",
    suggestedNextAction: "Acquire missing context or strengthen analysis before provider preflight.",
    verifierMarker: "harness-failure:analysis-blocked-provider",
  },
  "analysis-blocked-verification": {
    failureClass: "analysis-blocked-verification",
    capabilityArea: "runtime-verification",
    lifecycleStage: "verification",
    safeReason: "Analysis or context sufficiency blocked verification readiness.",
    suggestedNextAction: "Acquire test-impact or verification evidence before verification planning.",
    verifierMarker: "harness-failure:analysis-blocked-verification",
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
  "provider-dry-run-not-opted-in": {
    failureClass: "provider-dry-run-not-opted-in",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Real-provider proposal dry-run was not explicitly opted in.",
    suggestedNextAction: "Use deterministic fake-provider coverage or explicit isolated dry-run opt-in.",
    verifierMarker: "harness-failure:provider-dry-run-not-opted-in",
  },
  "provider-prompt-audit-failed": {
    failureClass: "provider-prompt-audit-failed",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider prompt audit found budget, redaction, or missing evidence risk.",
    suggestedNextAction: "Redact and budget prompt context before provider dry-run.",
    verifierMarker: "harness-failure:provider-prompt-audit-failed",
  },
  "provider-output-malformed": {
    failureClass: "provider-output-malformed",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output was malformed for proposal normalization.",
    suggestedNextAction: "Request a target-bound proposal in the supported manifest shape.",
    verifierMarker: "harness-failure:provider-output-malformed",
  },
  "provider-output-unanchored": {
    failureClass: "provider-output-unanchored",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output was not anchored to explicit targets.",
    suggestedNextAction: "Request exact old/new anchors tied to explicit target labels.",
    verifierMarker: "harness-failure:provider-output-unanchored",
  },
  "provider-output-unsafe": {
    failureClass: "provider-output-unsafe",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output contained unsafe or destructive content.",
    suggestedNextAction: "Discard the output and retry only with bounded safety constraints.",
    verifierMarker: "harness-failure:provider-output-unsafe",
  },
  "provider-output-over-budget": {
    failureClass: "provider-output-over-budget",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output exceeded the dry-run output budget.",
    suggestedNextAction: "Request a smaller bounded proposal.",
    verifierMarker: "harness-failure:provider-output-over-budget",
  },
  "provider-anchor-quality-low": {
    failureClass: "provider-anchor-quality-low",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider proposal anchor quality is too low for review handoff.",
    suggestedNextAction: "Add explicit target anchors and verification expectation before review.",
    verifierMarker: "harness-failure:provider-anchor-quality-low",
  },
  "provider-anchor-no-match": {
    failureClass: "provider-anchor-no-match",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider anchor did not match current target content.",
    suggestedNextAction: "Refresh target context or request an exact current old anchor.",
    verifierMarker: "harness-failure:provider-anchor-no-match",
  },
  "provider-anchor-ambiguous": {
    failureClass: "provider-anchor-ambiguous",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider anchor matched ambiguously or needs target selection.",
    suggestedNextAction: "Select one target/hunk or request a unique exact old anchor.",
    verifierMarker: "harness-failure:provider-anchor-ambiguous",
  },
  "provider-anchor-stale-context": {
    failureClass: "provider-anchor-stale-context",
    capabilityArea: "workspace-file-context",
    lifecycleStage: "proposal",
    safeReason: "Provider anchoring is blocked by stale context.",
    suggestedNextAction: "Re-read target files before anchoring provider output.",
    verifierMarker: "harness-failure:provider-anchor-stale-context",
  },
  "provider-anchor-conflict": {
    failureClass: "provider-anchor-conflict",
    capabilityArea: "edit-patch",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider hunks overlap or conflict before apply.",
    suggestedNextAction: "Resolve overlapping or conflicting anchored hunks before review handoff.",
    verifierMarker: "harness-failure:provider-anchor-conflict",
  },
  "provider-anchor-unsupported-fuzzy-output": {
    failureClass: "provider-anchor-unsupported-fuzzy-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Fuzzy or broad provider output is unsupported for anchoring.",
    suggestedNextAction: "Request bounded exact anchors; do not fuzzy apply.",
    verifierMarker: "harness-failure:provider-anchor-unsupported-fuzzy-output",
  },
  "provider-anchor-unsafe-output": {
    failureClass: "provider-anchor-unsafe-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider anchor output was unsafe.",
    suggestedNextAction: "Discard unsafe provider output and retry with safety constraints.",
    verifierMarker: "harness-failure:provider-anchor-unsafe-output",
  },
  "provider-anchor-malformed-output": {
    failureClass: "provider-anchor-malformed-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider anchor output was malformed.",
    suggestedNextAction: "Request a supported target-bound proposal shape.",
    verifierMarker: "harness-failure:provider-anchor-malformed-output",
  },
  "provider-invalid-output": {
    failureClass: "provider-invalid-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Provider output could not be normalized into a safe proposal.",
    suggestedNextAction: "Request a bounded exact proposal tied to context ids.",
    verifierMarker: "harness-failure:provider-invalid-output",
  },
  "smoke-no-opt-in": {
    failureClass: "smoke-no-opt-in",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored real-provider smoke was not explicitly opted in.",
    suggestedNextAction: "Run fake corpus or pass the explicit anchored smoke opt-in.",
    verifierMarker: "harness-failure:smoke-no-opt-in",
  },
  "smoke-provider-unavailable": {
    failureClass: "smoke-provider-unavailable",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored real-provider smoke provider was unavailable or not configured.",
    suggestedNextAction: "Use fake corpus or run the approved readiness gate before smoke.",
    verifierMarker: "harness-failure:smoke-provider-unavailable",
  },
  "smoke-prompt-audit-failed": {
    failureClass: "smoke-prompt-audit-failed",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider smoke prompt audit failed.",
    suggestedNextAction: "Redact, budget, and complete provider prompt context before smoke.",
    verifierMarker: "harness-failure:smoke-prompt-audit-failed",
  },
  "smoke-output-invalid": {
    failureClass: "smoke-output-invalid",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider smoke output was invalid for a safe proposal.",
    suggestedNextAction: "Request bounded target-bound old/new anchors.",
    verifierMarker: "harness-failure:smoke-output-invalid",
  },
  "smoke-anchoring-failed": {
    failureClass: "smoke-anchoring-failed",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider smoke could not produce exact anchored handoff evidence.",
    suggestedNextAction: "Refresh target context or request more precise anchors.",
    verifierMarker: "harness-failure:smoke-anchoring-failed",
  },
  "smoke-unsafe-output": {
    failureClass: "smoke-unsafe-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider smoke output was unsafe.",
    suggestedNextAction: "Discard unsafe output and retry only with bounded safety constraints.",
    verifierMarker: "harness-failure:smoke-unsafe-output",
  },
  "smoke-exact-ready-no-write": {
    failureClass: "smoke-exact-ready-no-write",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Anchored provider smoke produced exact-ready no-write evidence.",
    suggestedNextAction: "Review and explicitly confirm before any existing apply lane.",
    verifierMarker: "harness-failure:smoke-exact-ready-no-write",
  },
  "smoke-corpus-regression": {
    failureClass: "smoke-corpus-regression",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Deterministic anchored fake corpus did not match expected quality outcomes.",
    suggestedNextAction: "Fix the corpus, report scoring, or anchored dry-run regression.",
    verifierMarker: "harness-failure:smoke-corpus-regression",
  },
  "live-smoke-no-opt-in": {
    failureClass: "live-smoke-no-opt-in",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke was not explicitly opted in.",
    suggestedNextAction: "Use fake corpus or set explicit smoke opt-in.",
    verifierMarker: "harness-failure:live-smoke-no-opt-in",
  },
  "live-smoke-provider-unavailable": {
    failureClass: "live-smoke-provider-unavailable",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke provider is unavailable or not configured.",
    suggestedNextAction: "Run readiness checks through approved isolated gate or use fake corpus.",
    verifierMarker: "harness-failure:live-smoke-provider-unavailable",
  },
  "live-smoke-output-invalid": {
    failureClass: "live-smoke-output-invalid",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke output was invalid.",
    suggestedNextAction: "Request bounded target-bound old/new anchors.",
    verifierMarker: "harness-failure:live-smoke-output-invalid",
  },
  "live-smoke-anchor-failed": {
    failureClass: "live-smoke-anchor-failed",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke could not produce exact anchor evidence.",
    suggestedNextAction: "Refresh target context or request more precise anchors.",
    verifierMarker: "harness-failure:live-smoke-anchor-failed",
  },
  "live-smoke-unsafe-output": {
    failureClass: "live-smoke-unsafe-output",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke output was unsafe.",
    suggestedNextAction: "Discard unsafe output and retry with bounded safety constraints.",
    verifierMarker: "harness-failure:live-smoke-unsafe-output",
  },
  "live-smoke-no-write-violation": {
    failureClass: "live-smoke-no-write-violation",
    capabilityArea: "provider-model",
    lifecycleStage: "proposal",
    safeReason: "Live anchored provider smoke produced output with potential write/mutation evidence.",
    suggestedNextAction: "Keep no-write enforcement; do not apply live smoke output.",
    verifierMarker: "harness-failure:live-smoke-no-write-violation",
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
  if (/missing-required-context|missing required context|needs-required-context/.test(text)) return TAXONOMY["missing-required-context"];
  if (/under-evidenced-analysis|under-evidenced|stop-under-evidenced-analysis/.test(text)) return TAXONOMY["under-evidenced-analysis"];
  if (/stale-analysis-context|stale-context|stop-stale-context/.test(text)) return TAXONOMY["stale-analysis-context"];
  if (/analysis-blocked-provider|provider.*blocked.*analysis|provider-blocked-by-analysis-quality/.test(text)) return TAXONOMY["analysis-blocked-provider"];
  if (/analysis-blocked-verification|verification.*blocked.*context|verification-blocked-by-context-sufficiency/.test(text)) return TAXONOMY["analysis-blocked-verification"];
  if (/provider-output.*over-budget|over-budget-output/.test(text)) return TAXONOMY["provider-output-over-budget"];
  if (/budget-limited|over-budget|over-byte-budget|over-file-budget|over-node-budget/.test(text)) return TAXONOMY["context-budget-limited"];
  if (/low-plan-quality|plan-quality.*low-confidence|low-confidence/.test(text)) return TAXONOMY["low-plan-quality"];
  if (/missing-context|context-missing|context packet.*missing|agent plan.*missing/.test(text)) return TAXONOMY["missing-context"];
  if (/smoke no opt-in|smoke-no-opt-in|anchored-provider-smoke-gate:skip-reason:no-opt-in/.test(text)) return TAXONOMY["smoke-no-opt-in"];
  if (/smoke provider unavailable|smoke-provider-unavailable|provider-smoke.*provider-unavailable|anchored-provider-smoke-gate:skip-reason:provider/.test(text)) return TAXONOMY["smoke-provider-unavailable"];
  if (/smoke prompt audit failed|smoke-prompt-audit-failed/.test(text)) return TAXONOMY["smoke-prompt-audit-failed"];
  if (/smoke output invalid|smoke-output-invalid/.test(text)) return TAXONOMY["smoke-output-invalid"];
  if (/smoke unsafe output|smoke-unsafe-output/.test(text)) return TAXONOMY["smoke-unsafe-output"];
  if (/smoke exact-ready no-write|smoke-exact-ready-no-write/.test(text)) return TAXONOMY["smoke-exact-ready-no-write"];
  if (/smoke corpus regression|smoke-corpus-regression/.test(text)) return TAXONOMY["smoke-corpus-regression"];
  if (/smoke anchoring failed|smoke-anchoring-failed/.test(text)) return TAXONOMY["smoke-anchoring-failed"];
  if (/live-smoke-no-opt-in|live.*smoke.*no.*opt/.test(text)) return TAXONOMY["live-smoke-no-opt-in"];
  if (/live-smoke-provider-unavailable|live.*smoke.*provider.*unavailable/.test(text)) return TAXONOMY["live-smoke-provider-unavailable"];
  if (/live-smoke-output-invalid|live.*smoke.*output.*invalid/.test(text)) return TAXONOMY["live-smoke-output-invalid"];
  if (/live-smoke-anchor-failed|live.*smoke.*anchor.*fail/.test(text)) return TAXONOMY["live-smoke-anchor-failed"];
  if (/live-smoke-unsafe-output|live.*smoke.*unsafe/.test(text)) return TAXONOMY["live-smoke-unsafe-output"];
  if (/live-smoke-no-write-violation|live.*smoke.*write.*violation/.test(text)) return TAXONOMY["live-smoke-no-write-violation"];
  if (/provider.*invalid|provider-invalid|invalid-proposal|invalid proposal|invalid output/.test(text)) return TAXONOMY["provider-invalid-output"];
  if (/provider-dry-run-not-opted-in|dry-run-stopped-no-opt-in|stop-no-opt-in/.test(text)) return TAXONOMY["provider-dry-run-not-opted-in"];
  if (/provider-prompt-audit-failed|dry-run-prompt-audit-failed|prompt-audit.*fail/.test(text)) return TAXONOMY["provider-prompt-audit-failed"];
  if (/provider-output.*malformed|malformed-output/.test(text)) return TAXONOMY["provider-output-malformed"];
  if (/provider-output.*unanchored|unanchored-generated/.test(text)) return TAXONOMY["provider-output-unanchored"];
  if (/provider-output.*unsafe|unsafe-output|anchor-quality.*unsafe/.test(text)) return TAXONOMY["provider-output-unsafe"];
  if (/provider-anchor-match:outcome:no-match|provider-anchoring-result:status:no-anchors-found|anchor no-match/.test(text)) return TAXONOMY["provider-anchor-no-match"];
  if (/provider-anchor-match:outcome:multiple-candidates-ambiguous|provider-anchoring-result:status:ambiguous-anchors|anchor ambiguous|target-selection-required/.test(text)) return TAXONOMY["provider-anchor-ambiguous"];
  if (/provider-anchor-match:outcome:stale-context|provider-anchor-conflict:kind:stale-match-facts|stale-context-blocks-anchoring/.test(text)) return TAXONOMY["provider-anchor-stale-context"];
  if (/provider-anchor-conflict:kind:(?:overlapping-hunks|conflicting-replacements|same-target-range|duplicate-candidate|hunk-set-over-max|target-set-over-max)|anchor conflict/.test(text)) return TAXONOMY["provider-anchor-conflict"];
  if (/unsupported-fuzzy-or-broad-output|provider-anchor-candidate:unsupported:unsupported fuzzy output|provider-anchor-candidate:unsupported:unsupported broad refactor output/.test(text)) return TAXONOMY["provider-anchor-unsupported-fuzzy-output"];
  if (/provider-anchor-candidate:unsupported:unsafe provider output|provider-anchoring-result:status:unsafe-or-malformed-provider-output/.test(text)) return TAXONOMY["provider-anchor-unsafe-output"];
  if (/provider-anchor-candidate:unsupported:malformed provider output|provider-anchor-malformed-output/.test(text)) return TAXONOMY["provider-anchor-malformed-output"];
  if (/provider-anchor-quality-low|dry-run-anchor-quality-low|anchor-quality.*low-confidence/.test(text)) return TAXONOMY["provider-anchor-quality-low"];
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
