import type { BrowserActionContract } from "./browserActionContract.js";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserRuntimeRecommendation } from "./browserRuntimeDecision.js";
import type { BrowserSandboxPolicyResult } from "./browserSandboxPolicy.js";

export interface BrowserDryRunStep {
  readonly order: number;
  readonly label: string;
  readonly detail: string;
}

export interface BrowserDryRunPlan {
  readonly dryRunId: string;
  readonly createdAt?: string;
  readonly requestedAction: BrowserActionContract;
  readonly recommendedRuntime: BrowserRuntimeRecommendation;
  readonly sandboxDecision: BrowserSandboxPolicyResult;
  readonly plannedSteps: readonly BrowserDryRunStep[];
  readonly requiredConfirmations: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly blockedReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly executed: false;
  readonly browserProcessLaunched: false;
  readonly mcpLaunch: false;
  readonly networkAccess: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly rawContent: "excluded";
  readonly evidence: readonly string[];
}

export interface BrowserDryRunPlanInput {
  readonly requestedAction: BrowserActionContract;
  readonly recommendedRuntime: BrowserRuntimeRecommendation;
  readonly sandboxDecision: BrowserSandboxPolicyResult;
  readonly readinessStatus: string;
  readonly now?: () => string;
  readonly nextId?: () => string;
}

export function createBrowserDryRunPlan(input: BrowserDryRunPlanInput): BrowserDryRunPlan {
  const blockedReasons = blockedReasonsFor(input);
  const warnings = warningsFor(input);
  return {
    dryRunId: input.nextId?.() ?? deterministicDryRunId(input.requestedAction),
    createdAt: input.now?.(),
    requestedAction: input.requestedAction,
    recommendedRuntime: input.recommendedRuntime,
    sandboxDecision: input.sandboxDecision,
    plannedSteps: plannedStepsFor(input.requestedAction),
    requiredConfirmations: input.sandboxDecision.futureConfirmations,
    expectedEvidence: expectedEvidenceFor(input.requestedAction),
    blockedReasons,
    warnings,
    nextAction: nextActionFor(blockedReasons, input.sandboxDecision.nextAction),
    executed: false,
    browserProcessLaunched: false,
    mcpLaunch: false,
    networkAccess: false,
    providerCall: "none",
    modelCall: "none",
    rawContent: "excluded",
    evidence: [
      "browser-dry-run-plan:pure",
      `browser-dry-run-plan:action:${input.requestedAction.actionKind}`,
      `browser-dry-run-plan:runtime:${input.recommendedRuntime.candidate}`,
      "browser-dry-run-plan:executed:false",
      "browser-dry-run-plan:no-browser-process",
      "browser-dry-run-plan:no-mcp-launch",
      "browser-dry-run-plan:no-network",
      "browser-dry-run-plan:no-provider-or-model-call",
      "browser-dry-run-plan:no-raw-content",
    ],
  };
}

function plannedStepsFor(action: BrowserActionContract): readonly BrowserDryRunStep[] {
  const safeTarget = sanitizeBrowserText(
    action.url ?? action.target ?? action.extractionGoal ?? action.actionKind,
    160,
  );
  const base: BrowserDryRunStep[] = [
    {
      order: 1,
      label: "Validate request",
      detail: `Classify ${action.actionKind} target and safety requirements.`,
    },
    {
      order: 2,
      label: "Select runtime",
      detail: "Prefer the documented future backend without launching it.",
    },
  ];
  if (action.actionKind === "navigate") {
    base.push({
      order: 3,
      label: "Plan navigation",
      detail: `Would navigate to ${safeTarget} after sandbox and confirmation policy exists.`,
    });
  } else if (action.actionKind === "extract") {
    base.push({
      order: 3,
      label: "Plan extraction",
      detail: `Would collect structured evidence for ${safeTarget} without exposing raw page content.`,
    });
  } else if (action.actionKind === "click") {
    base.push({
      order: 3,
      label: "Plan click",
      detail: `Would resolve and confirm target ${safeTarget} before any state-changing action.`,
    });
  } else if (action.actionKind === "type") {
    base.push({
      order: 3,
      label: "Plan typing",
      detail: `Would resolve target ${safeTarget}, redact input, and require confirmation before execution.`,
    });
  } else {
    base.push({
      order: 3,
      label: "Plan blocked action",
      detail: `Action ${action.actionKind} remains blocked or future-only.`,
    });
  }
  base.push({
    order: 4,
    label: "Stop before execution",
    detail: "Do not launch a browser, MCP server, network request, provider call, or model call.",
  });
  return base;
}

function expectedEvidenceFor(action: BrowserActionContract): readonly string[] {
  switch (action.actionKind) {
    case "navigate":
      return [
        "navigation target",
        "accessibility snapshot summary",
        "action trace",
        "runtime logs",
      ];
    case "extract":
      return [
        "accessibility snapshot summary",
        "extraction schema/result summary",
        "action trace",
        "runtime logs",
      ];
    case "click":
      return [
        "selected element evidence",
        "accessibility snapshot summary",
        "action trace",
        "runtime logs",
      ];
    case "type":
      return [
        "selected element evidence",
        "redacted input summary",
        "action trace",
        "runtime logs",
      ];
    case "screenshot":
      return ["screenshot reference only if a future route enables screenshot policy"];
    default:
      return [
        "blocked action reason",
        "required sandbox/confirmation summary",
      ];
  }
}

function blockedReasonsFor(input: BrowserDryRunPlanInput): readonly string[] {
  const reasons = [
    ...input.sandboxDecision.blockers
      .filter((blocker) => blocker.decision === "blocked")
      .map((blocker) => blocker.reason),
  ];
  if (input.readinessStatus !== "supported-preview") {
    reasons.push(`Readiness status is ${input.readinessStatus}.`);
  }
  if (input.recommendedRuntime.candidate === "unavailable") {
    reasons.push("No browser execution backend is available.");
  }
  return unique(reasons.map((reason) => sanitizeBrowserText(reason)));
}

function warningsFor(input: BrowserDryRunPlanInput): readonly string[] {
  const warnings = input.sandboxDecision.blockers
    .filter((blocker) => blocker.decision !== "blocked")
    .map((blocker) => blocker.reason);
  if (input.requestedAction.risk === "state-changing") {
    warnings.push("State-changing browser action would require explicit future confirmation.");
  }
  return unique(warnings.map((warning) => sanitizeBrowserText(warning)));
}

function nextActionFor(blockedReasons: readonly string[], sandboxNextAction: string): string {
  if (blockedReasons.length > 0) {
    return "Keep this browser action blocked and use the dry-run plan only as implementation guidance.";
  }
  return sanitizeBrowserText(sandboxNextAction);
}

function deterministicDryRunId(action: BrowserActionContract): string {
  const seed = [
    action.actionKind,
    action.url ?? "",
    action.target ?? "",
    action.extractionGoal ?? "",
    action.text ? "[redacted-text]" : "",
  ].join("|");
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `browser-dry-run:${hash.toString(16).padStart(8, "0")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
