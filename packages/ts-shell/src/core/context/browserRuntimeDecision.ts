import type { BrowserActionContract } from "./browserActionContract.js";
import { sanitizeBrowserText, type BrowserBackendKind } from "./browserCapabilityModel.js";

export type BrowserRuntimeCandidate =
  | "playwright-cli-skills"
  | "playwright-mcp"
  | "stagehand-like"
  | "custom-playwright-wrapper"
  | "unavailable";

export type BrowserRuntimeDecisionReason =
  | "token-efficient"
  | "deterministic-actions"
  | "sandboxable"
  | "evidence-friendly"
  | "easy-integration"
  | "mcp-overhead"
  | "state-persistence-risk"
  | "simple-ux"
  | "testable"
  | "unsafe-input"
  | "execution-disabled";

export interface BrowserRuntimeRecommendation {
  readonly candidate: BrowserRuntimeCandidate;
  readonly label: string;
  readonly summary: string;
  readonly reasons: readonly BrowserRuntimeDecisionReason[];
}

export interface BrowserRuntimeDecisionInput {
  readonly action?: BrowserActionContract;
  readonly requestedBackend?: BrowserBackendKind | BrowserRuntimeCandidate;
  readonly backendAvailable?: boolean;
}

export interface BrowserRuntimeDecisionResult {
  readonly recommendation: BrowserRuntimeRecommendation;
  readonly alternatives: readonly BrowserRuntimeRecommendation[];
  readonly executionAvailable: false;
  readonly dynamicDiscovery: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly evidence: readonly string[];
}

const PLAYWRIGHT_CLI: BrowserRuntimeRecommendation = {
  candidate: "playwright-cli-skills",
  label: "Playwright CLI/Skills",
  summary: "Preferred first execution prototype: deterministic commands, compact context, explicit sandbox wrapper.",
  reasons: [
    "token-efficient",
    "deterministic-actions",
    "sandboxable",
    "evidence-friendly",
    "easy-integration",
    "simple-ux",
    "testable",
  ],
};

const PLAYWRIGHT_MCP: BrowserRuntimeRecommendation = {
  candidate: "playwright-mcp",
  label: "Playwright MCP",
  summary: "Useful later for persistent browser state and rich accessibility introspection, but higher context and lifecycle cost.",
  reasons: [
    "deterministic-actions",
    "evidence-friendly",
    "mcp-overhead",
    "state-persistence-risk",
  ],
};

const STAGEHAND_LIKE: BrowserRuntimeRecommendation = {
  candidate: "stagehand-like",
  label: "Stagehand-like abstraction",
  summary: "Useful later for observe/act/extract separation and action cache semantics; not first because it implies planner/model boundaries.",
  reasons: [
    "evidence-friendly",
    "state-persistence-risk",
    "testable",
  ],
};

const CUSTOM_WRAPPER: BrowserRuntimeRecommendation = {
  candidate: "custom-playwright-wrapper",
  label: "Custom Playwright wrapper",
  summary: "Possible only after sandbox and evidence contracts settle; avoid inventing runtime policy before CLI/Skills prototype proves need.",
  reasons: [
    "sandboxable",
    "testable",
  ],
};

const UNAVAILABLE: BrowserRuntimeRecommendation = {
  candidate: "unavailable",
  label: "Execution unavailable",
  summary: "No browser backend is enabled; dry-run can still explain the future plan without execution.",
  reasons: [
    "execution-disabled",
    "testable",
  ],
};

export function decideBrowserRuntime(
  input: BrowserRuntimeDecisionInput = {},
): BrowserRuntimeDecisionResult {
  const unsafe = isUnsafeForRuntimeDecision(input.action);
  const requested = normalizeCandidate(input.requestedBackend);
  const backendAvailable = input.backendAvailable ?? true;
  const recommendation = !backendAvailable
    ? UNAVAILABLE
    : unsafe
      ? withReasons(UNAVAILABLE, ["unsafe-input"])
      : requested
        ? recommendationForCandidate(requested)
        : PLAYWRIGHT_CLI;
  return {
    recommendation: sanitizeRecommendation(recommendation),
    alternatives: [
      PLAYWRIGHT_CLI,
      PLAYWRIGHT_MCP,
      STAGEHAND_LIKE,
      CUSTOM_WRAPPER,
    ].filter((item) => item.candidate !== recommendation.candidate).map(sanitizeRecommendation),
    executionAvailable: false,
    dynamicDiscovery: false,
    providerCall: "none",
    modelCall: "none",
    evidence: [
      "browser-runtime-decision:pure",
      `browser-runtime-decision:recommended:${recommendation.candidate}`,
      "browser-runtime-decision:no-runtime-launch",
      "browser-runtime-decision:no-dynamic-discovery",
      "browser-runtime-decision:no-provider-or-model-call",
    ],
  };
}

function isUnsafeForRuntimeDecision(action: BrowserActionContract | undefined): boolean {
  return !!action && (
    action.requiresAuth ||
    action.actionKind === "auth" ||
    action.actionKind === "payment" ||
    action.actionKind === "destructive" ||
    action.risk === "destructive"
  );
}

function normalizeCandidate(
  value: BrowserRuntimeDecisionInput["requestedBackend"],
): BrowserRuntimeCandidate | undefined {
  switch (value) {
    case "planned-playwright-cli":
    case "playwright-cli-skills":
      return "playwright-cli-skills";
    case "planned-playwright-mcp":
    case "playwright-mcp":
      return "playwright-mcp";
    case "planned-stagehand-like":
    case "stagehand-like":
      return "stagehand-like";
    case "custom-playwright-wrapper":
      return "custom-playwright-wrapper";
    case "none":
    case "unavailable":
      return "unavailable";
    default:
      return undefined;
  }
}

function recommendationForCandidate(candidate: BrowserRuntimeCandidate): BrowserRuntimeRecommendation {
  switch (candidate) {
    case "playwright-cli-skills":
      return PLAYWRIGHT_CLI;
    case "playwright-mcp":
      return PLAYWRIGHT_MCP;
    case "stagehand-like":
      return STAGEHAND_LIKE;
    case "custom-playwright-wrapper":
      return CUSTOM_WRAPPER;
    case "unavailable":
      return UNAVAILABLE;
  }
}

function withReasons(
  recommendation: BrowserRuntimeRecommendation,
  reasons: readonly BrowserRuntimeDecisionReason[],
): BrowserRuntimeRecommendation {
  return {
    ...recommendation,
    reasons: unique([...recommendation.reasons, ...reasons]),
  };
}

function sanitizeRecommendation(
  recommendation: BrowserRuntimeRecommendation,
): BrowserRuntimeRecommendation {
  return {
    ...recommendation,
    label: sanitizeBrowserText(recommendation.label, 80),
    summary: sanitizeBrowserText(recommendation.summary),
    reasons: unique(recommendation.reasons),
  };
}

function unique<T>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}
