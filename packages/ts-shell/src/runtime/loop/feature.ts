export interface FutureFeatureIntegrationDeclaration {
  readonly featureId: string;
  readonly ownerDomain: string;
  readonly loopPhase: string;
  readonly inputFacts: readonly string[];
  readonly outputHandoffFacts: readonly string[];
  readonly runtimeEvents: readonly string[];
  readonly evidenceFacts: readonly string[];
  readonly productSurfaceSection: string;
  readonly resultTruthfulnessBoundary: string;
  readonly notProvenClaims: readonly string[];
  readonly forbiddenShortcuts: readonly string[];
  readonly validationGates: readonly string[];
  readonly terminalSuccessClaim?: false;
}

export interface FutureFeatureIntegrationContract {
  readonly declaration: FutureFeatureIntegrationDeclaration;
  readonly valid: boolean;
  readonly missingFields: readonly string[];
  readonly forbiddenShortcutCount: number;
  readonly validationGateCount: number;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REQUIRED_TEXT_FIELDS = [
  "featureId",
  "ownerDomain",
  "loopPhase",
  "productSurfaceSection",
  "resultTruthfulnessBoundary",
] as const;

const REQUIRED_LIST_FIELDS = [
  "inputFacts",
  "outputHandoffFacts",
  "runtimeEvents",
  "evidenceFacts",
  "notProvenClaims",
  "forbiddenShortcuts",
  "validationGates",
] as const;

export function validateFutureFeatureIntegration(
  declaration: FutureFeatureIntegrationDeclaration,
): FutureFeatureIntegrationContract {
  const missingText = REQUIRED_TEXT_FIELDS.filter((field) =>
    declaration[field].trim().length === 0
  );
  const missingLists = REQUIRED_LIST_FIELDS.filter((field) =>
    declaration[field].length === 0
  );
  const terminalClaimMissing = declaration.terminalSuccessClaim === undefined
    ? []
    : declaration.terminalSuccessClaim === false
      ? []
      : ["terminalSuccessClaim"];
  const missingFields = Object.freeze([
    ...missingText,
    ...missingLists,
    ...terminalClaimMissing,
  ]);

  return deepFreeze({
    declaration: {
      ...declaration,
      featureId: sanitizeId(declaration.featureId),
      ownerDomain: sanitizeId(declaration.ownerDomain),
      loopPhase: sanitizeId(declaration.loopPhase),
      inputFacts: declaration.inputFacts.map(sanitizeId),
      outputHandoffFacts: declaration.outputHandoffFacts.map(sanitizeId),
      runtimeEvents: declaration.runtimeEvents.map(sanitizeId),
      evidenceFacts: declaration.evidenceFacts.map(sanitizeId),
      productSurfaceSection: sanitizeId(declaration.productSurfaceSection),
      resultTruthfulnessBoundary: sanitizeId(
        declaration.resultTruthfulnessBoundary,
      ),
      notProvenClaims: declaration.notProvenClaims.map(sanitizeId),
      forbiddenShortcuts: declaration.forbiddenShortcuts.map(sanitizeId),
      validationGates: declaration.validationGates.map(sanitizeId),
      terminalSuccessClaim: false,
    },
    valid: missingFields.length === 0,
    missingFields,
    forbiddenShortcutCount: declaration.forbiddenShortcuts.length,
    validationGateCount: declaration.validationGates.length,
    notProvenClaims: Object.freeze([
      ...new Set([
        "feature-contract-valid-is-not-success",
        "terminal-success",
        ...declaration.notProvenClaims.map(sanitizeId),
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

export function buildContextDiscoveryTargetSelectionFeatureContract(): FutureFeatureIntegrationContract {
  return validateFutureFeatureIntegration({
    featureId: "context-discovery-target-selection",
    ownerDomain: "orchestration/repo-intelligence",
    loopPhase: "context-discovery-target-selection",
    inputFacts: [
      "user-task",
      "workspace-label",
      "bounded-file-scan-profile",
      "package-map",
      "module-map",
    ],
    outputHandoffFacts: [
      "scan-profile-id",
      "selected-candidate-ids",
      "competing-candidate-ids",
      "omitted-candidate-facts",
      "ambiguity-state",
      "missing-discovery-facts",
      "target-ranking-evidence-id",
      "raw-content-excluded",
    ],
    runtimeEvents: [
      "context-discovery-observed",
      "target-ranking-observed",
    ],
    evidenceFacts: [
      "scan-budget",
      "files-considered-count",
      "files-omitted-count",
      "candidate-score-components",
      "candidate-ranking-reasons",
      "raw-content-excluded",
    ],
    productSurfaceSection: "context-discovery",
    resultTruthfulnessBoundary: "context discovery and target ranking facts are not task success, edit authority, apply authority, or verification success",
    notProvenClaims: [
      "scan-completed-is-not-repository-understanding",
      "candidate-found-is-not-context-success",
      "high-ranked-file-is-not-correct-target",
      "selected-candidate-is-not-edit-authority",
      "feature-contract-valid-is-not-success",
      "product-surface-rendered-is-not-success",
    ],
    forbiddenShortcuts: [
      "treat-scan-completed-as-repository-understanding",
      "treat-candidate-found-as-context-success",
      "treat-high-rank-as-correct-target",
      "treat-selected-candidate-as-edit-authority",
      "treat-feature-contract-valid-as-task-success",
    ],
    validationGates: [
      "repo-intelligence-focused-tests",
      "context-engine-focused-tests",
      "target-ranking-ambiguity-tests",
      "feature-contract-tests",
      "redaction-tests",
      "truthfulness-tests",
    ],
    terminalSuccessClaim: false,
  });
}

export function buildStagedContextAcquisitionFeatureContract(): FutureFeatureIntegrationContract {
  return validateFutureFeatureIntegration({
    featureId: "staged-context-acquisition",
    ownerDomain: "orchestration/context-graph",
    loopPhase: "context-acquisition",
    inputFacts: [
      "context-discovery-handoff",
      "selected-candidate-ids",
      "target-ranking-evidence-id",
      "read-budget",
      "context-packet-id",
      "context-graph-id",
    ],
    outputHandoffFacts: [
      "staged-read-plan",
      "read-budget-accounting",
      "context-packet-provenance",
      "context-graph-score-components",
      "code-graph-impact-trace",
      "stale-context-facts",
      "required-missing-facts",
      "optional-missing-facts",
      "next-read-suggestions",
      "context-sufficiency-decision",
    ],
    runtimeEvents: [
      "staged-context-acquisition-observed",
      "context-packet-observed",
      "context-graph-score-observed",
    ],
    evidenceFacts: [
      "read-stage-reasons",
      "read-budget-files-read",
      "read-budget-files-skipped",
      "packet-provenance",
      "graph-score-components",
      "impact-trace-classifications",
      "stale-context-status",
      "raw-content-excluded",
    ],
    productSurfaceSection: "staged-context-acquisition",
    resultTruthfulnessBoundary: "staged context acquisition facts are not edit authority, apply authority, verification success, or task success",
    notProvenClaims: [
      "read-planned-is-not-read-completed",
      "read-completed-is-not-enough-context",
      "context-packet-exists-is-not-repository-understanding",
      "graph-edge-observed-is-not-full-impact-proof",
      "stale-context-cannot-be-fresh-context",
      "next-read-suggestion-is-not-completed-read",
      "sufficient-for-review-only-planning-is-not-edit-authority",
      "feature-contract-valid-is-not-success",
    ],
    forbiddenShortcuts: [
      "treat-read-planned-as-read-completed",
      "treat-read-completed-as-enough-context",
      "treat-context-packet-as-repository-understanding",
      "treat-graph-edge-as-full-impact-proof",
      "treat-stale-context-as-fresh-context",
      "treat-next-read-suggestion-as-completed-read",
      "treat-review-only-sufficiency-as-edit-authority",
      "treat-feature-contract-valid-as-task-success",
    ],
    validationGates: [
      "context-graph-focused-tests",
      "context-engine-focused-tests",
      "context-acquisition-projection-tests",
      "feature-contract-tests",
      "redaction-tests",
      "truthfulness-tests",
    ],
    terminalSuccessClaim: false,
  });
}

export function buildPlanningFeatureContract(): FutureFeatureIntegrationContract {
  return validateFutureFeatureIntegration({
    featureId: "planning-owner-handoff",
    ownerDomain: "orchestration/planning-runtime",
    loopPhase: "planning",
    inputFacts: [
      "context-discovery-handoff",
      "target-ranking-evidence-id",
      "staged-context-acquisition-facts",
      "context-sufficiency-decision",
      "task-kind",
      "verification-command-plan",
    ],
    outputHandoffFacts: [
      "planning-owner-boundary",
      "plan-quality-facts",
      "evidence-bound-plan-steps",
      "planning-assumptions",
      "planning-constraints",
      "plan-to-edit-handoff",
      "plan-to-verification-handoff",
      "unsupported-classification",
      "next-action-suggestion",
    ],
    runtimeEvents: [
      "planning-owner-observed",
      "plan-quality-observed",
      "edit-handoff-observed",
      "verification-handoff-observed",
    ],
    evidenceFacts: [
      "context-sufficiency-input",
      "context-source-ids",
      "discovery-handoff-ids",
      "staged-context-ids",
      "plan-step-evidence-source-ids",
      "edit-handoff-no-write-status",
      "verification-selected-not-run-status",
      "raw-content-excluded",
    ],
    productSurfaceSection: "planning-owner-handoff",
    resultTruthfulnessBoundary: "planning facts are not executable work, mutation authority, apply success, verification success, repair success, or terminal success",
    notProvenClaims: [
      "plan-generated-is-not-executable-work",
      "target-selected-is-not-correct-target-proof",
      "edit-handoff-ready-is-not-mutation-authority",
      "exact-proposal-readiness-must-come-from-existing-proposal-backend",
      "verification-intent-is-not-verification-run-or-pass",
      "selected-command-is-not-verification-passed",
      "unsupported-classification-is-not-success",
      "feature-contract-valid-is-not-success",
      "product-surface-rendered-is-not-success",
    ],
    forbiddenShortcuts: [
      "treat-plan-generated-as-executed-work",
      "treat-selected-target-as-correct-target-proof",
      "treat-edit-handoff-ready-as-mutation-authority",
      "treat-exact-ready-as-write-success",
      "treat-verification-intent-as-verification-passed",
      "treat-selected-command-as-verification-passed",
      "treat-unsupported-classification-as-success",
      "treat-feature-contract-valid-as-task-success",
      "treat-product-surface-rendered-as-task-success",
    ],
    validationGates: [
      "planning-runtime-focused-tests",
      "planning-handoff-focused-tests",
      "plan-to-edit-handoff-tests",
      "plan-to-verification-handoff-tests",
      "feature-contract-tests",
      "redaction-tests",
      "truthfulness-tests",
    ],
    terminalSuccessClaim: false,
  });
}

export function buildModelBoundaryFeatureContract(): FutureFeatureIntegrationContract {
  return validateFutureFeatureIntegration({
    featureId: "model-boundary",
    ownerDomain: "provider/runtime-loop",
    loopPhase: "model-boundary",
    inputFacts: [
      "context-planning-summary",
      "provider-registry",
      "provider-readiness",
      "planning-constraints",
      "no-write-status",
      "missing-required-facts",
    ],
    outputHandoffFacts: [
      "model-request-boundary",
      "provider-stream-projection",
      "assistant-response-accumulation",
      "tool-call-batch-not-dispatched",
      "cancellation-projection",
      "provider-failure-classification",
    ],
    runtimeEvents: [
      "model-request-prepared",
      "provider-stream-started",
      "provider-stream-delta-observed",
      "assistant-response-accumulated",
      "tool-call-batch-extracted",
      "provider-stream-cancelled",
      "provider-stream-failed",
      "model-boundary-completed",
    ],
    evidenceFacts: [
      "request-id",
      "provider-safe-label",
      "model-safe-label",
      "stream-status",
      "redaction-status",
      "terminal-success-claim-false",
    ],
    productSurfaceSection: "model-boundary",
    resultTruthfulnessBoundary: "model boundary facts are not task success, provider success, tool execution, mutation authority, verification success, or terminal success",
    notProvenClaims: [
      "model-request-prepared-is-not-provider-success",
      "stream-started-is-not-model-response-complete",
      "content-delta-is-not-final-response",
      "assistant-accumulated-is-not-task-success",
      "tool-call-extracted-is-not-tool-executed",
      "fallback-eligible-is-not-fallback-executed",
      "model-response-complete-is-not-task-success",
      "product-surface-rendered-is-not-success",
    ],
    forbiddenShortcuts: [
      "treat-provider-called-as-provider-success",
      "treat-stream-started-as-complete",
      "treat-content-delta-as-final-response",
      "treat-assistant-accumulated-as-task-success",
      "treat-tool-call-extracted-as-tool-executed",
      "treat-fallback-eligible-as-fallback-executed",
      "treat-model-response-complete-as-task-success",
    ],
    validationGates: [
      "provider-request-boundary-tests",
      "provider-response-stream-tests",
      "assistant-accumulation-tests",
      "tool-call-extraction-tests",
      "runtime-event-tests",
      "product-surface-tests",
      "redaction-tests",
      "truthfulness-tests",
    ],
    terminalSuccessClaim: false,
  });
}

export function buildContinuationContextFeatureContract(): FutureFeatureIntegrationContract {
  return validateFutureFeatureIntegration({
    featureId: "continuation-context",
    ownerDomain: "orchestration/context-memory",
    loopPhase: "continuation-context",
    inputFacts: [
      "context-memory-record-facts",
      "reuse-eligibility-facts",
      "stale-invalidation-facts",
      "session-context-rebuild-projection",
      "continuation-readiness-facts",
      "replay-safe-planning-state",
      "cp002-discovery-handoff",
      "cp003-staged-context-acquisition",
      "cp004-planning-handoff",
    ],
    outputHandoffFacts: [
      "memory-to-discovery-handoff",
      "memory-to-staged-read-handoff",
      "memory-to-planning-handoff",
      "required-refresh-reads",
      "optional-refresh-reads",
      "stale-packets-excluded",
      "continuation-context-readiness",
      "not-proven-claims",
    ],
    runtimeEvents: [
      "continuation-context-observed",
      "memory-reuse-eligibility-observed",
      "stale-invalidation-observed",
      "replay-safe-planning-state-observed",
    ],
    evidenceFacts: [
      "memory-record-id",
      "source-candidate-ids",
      "source-context-packet-ids",
      "source-planning-ids",
      "freshness-evidence",
      "staleness-evidence",
      "redaction-state",
      "terminal-success-claim-false",
    ],
    productSurfaceSection: "continuation-context",
    resultTruthfulnessBoundary: "continuation context facts are not fresh context, enough context, edit authority, apply authority, verification success, repair success, plan validity, or terminal success",
    notProvenClaims: [
      "memory-exists-is-not-fresh-context",
      "memory-reused-is-not-enough-context",
      "continuation-ready-is-not-task-success",
      "replay-state-available-is-not-plan-validity",
      "replayed-edit-handoff-is-not-mutation-authority",
      "replayed-verification-intent-is-not-verification-passed",
      "refresh-suggested-is-not-completed-read",
      "feature-contract-valid-is-not-success",
      "product-surface-rendered-is-not-success",
    ],
    forbiddenShortcuts: [
      "treat-memory-exists-as-fresh-context",
      "treat-memory-reused-as-enough-context",
      "treat-continuation-ready-as-task-success",
      "treat-replay-state-as-plan-validity",
      "treat-replayed-edit-handoff-as-mutation-authority",
      "treat-replayed-verification-intent-as-verification-passed",
      "treat-refresh-suggestion-as-completed-read",
      "treat-feature-contract-valid-as-task-success",
      "treat-product-surface-rendered-as-task-success",
    ],
    validationGates: [
      "context-memory-focused-tests",
      "context-engine-focused-tests",
      "session-context-rebuild-focused-tests",
      "continuation-readiness-focused-tests",
      "replay-safe-state-focused-tests",
      "feature-contract-tests",
      "redaction-tests",
      "truthfulness-tests",
    ],
    terminalSuccessClaim: false,
  });
}

function sanitizeId(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
