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
