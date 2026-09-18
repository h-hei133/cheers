import type { BrowserExecutionRequest } from "./browserExecutionContract.js";

export interface BrowserPlaywrightCliPlan {
  readonly runtime: "playwright-cli-skills";
  readonly launch: "not-started";
  readonly commandDescription: string;
  readonly requiredDependencies: readonly string[];
  readonly sandboxRequirements: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserPlaywrightCliPlan(
  request: BrowserExecutionRequest,
): BrowserPlaywrightCliPlan {
  return {
    runtime: "playwright-cli-skills",
    launch: "not-started",
    commandDescription: commandDescriptionForRequest(request),
    requiredDependencies: ["non-default executor injection", "route-scoped sandbox boundary"],
    sandboxRequirements: request.actionKind === "navigate"
      ? ["network allowlist", "ephemeral browser context", "no credential reuse"]
      : ["ephemeral browser context", "sanitized evidence only"],
    expectedEvidence: expectedEvidenceForRequest(request),
    evidence: [
      "browser-playwright-cli-adapter:plan-only",
      "browser-playwright-cli-adapter:no-process-spawn",
      "browser-playwright-cli-adapter:no-browser-launch",
      "browser-playwright-cli-adapter:no-network",
    ],
  };
}

function commandDescriptionForRequest(request: BrowserExecutionRequest): string {
  if (request.actionKind === "navigate") {
    return `Plan Playwright navigation to ${request.action.url ?? "(sanitized target)"}.`;
  }
  if (request.actionKind === "observe") {
    return "Plan Playwright accessibility snapshot/observation.";
  }
  if (request.actionKind === "extract") {
    return `Plan sanitized extraction for ${request.action.extractionGoal ?? "requested goal"}.`;
  }
  return `Plan future browser action ${request.actionKind}; execution remains blocked.`;
}

function expectedEvidenceForRequest(
  request: BrowserExecutionRequest,
): readonly string[] {
  if (request.actionKind === "navigate") {
    return ["navigation target", "status outcome", "sanitized page summary"];
  }
  if (request.actionKind === "observe") {
    return ["accessibility snapshot summary", "visible element count", "raw content excluded"];
  }
  if (request.actionKind === "extract") {
    return ["extraction schema/result summary", "source selector summary", "raw content excluded"];
  }
  return ["blocked action reason", "next action"];
}
