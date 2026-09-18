import type { BrowserExternalRunnerAction } from "../../../../../browser/runtime/external/protocol.js";

export type BrowserSkillRunnerActionKind =
  | "observe"
  | "extract"
  | "navigate-local"
  | "future-click"
  | "future-type"
  | "auth"
  | "payment"
  | "destructive"
  | "upload"
  | "download"
  | "screenshot"
  | "arbitrary-js";

export type BrowserSkillRunnerCapabilityRisk =
  | "read-only"
  | "local-only"
  | "state-changing-future"
  | "sensitive-blocked"
  | "unsupported";

export interface BrowserSkillRunnerCapability {
  readonly actionKind: BrowserSkillRunnerActionKind;
  readonly normalizedAction: BrowserExternalRunnerAction | "future-click" | "future-type" | "unsupported";
  readonly risk: BrowserSkillRunnerCapabilityRisk;
  readonly evidenceRequirement: "safe-summary" | "future-action-receipt" | "blocked";
  readonly execution: "metadata-only";
}

const ACTION_ALIASES: Readonly<Record<string, BrowserSkillRunnerActionKind>> = {
  observe: "observe",
  snapshot: "observe",
  extract: "extract",
  "navigate-local": "navigate-local",
  navigate: "navigate-local",
  click: "future-click",
  "future-click": "future-click",
  type: "future-type",
  "future-type": "future-type",
  auth: "auth",
  login: "auth",
  payment: "payment",
  purchase: "payment",
  destructive: "destructive",
  delete: "destructive",
  upload: "upload",
  download: "download",
  screenshot: "screenshot",
  "take-screenshot": "screenshot",
  "arbitrary-js": "arbitrary-js",
  evaluate: "arbitrary-js",
  "run-code": "arbitrary-js",
};

export function normalizeBrowserSkillRunnerCapabilities(
  values: readonly string[],
): readonly BrowserSkillRunnerCapability[] {
  const seen = new Set<string>();
  const capabilities: BrowserSkillRunnerCapability[] = [];
  for (const value of values) {
    const actionKind = normalizeBrowserSkillRunnerAction(value);
    if (!actionKind || seen.has(actionKind)) {
      continue;
    }
    seen.add(actionKind);
    capabilities.push(classifyBrowserSkillRunnerCapability(actionKind));
  }
  return capabilities;
}

export function normalizeBrowserSkillRunnerAction(
  value: string,
): BrowserSkillRunnerActionKind | undefined {
  return ACTION_ALIASES[value.trim().toLowerCase()];
}

export function classifyBrowserSkillRunnerCapability(
  actionKind: BrowserSkillRunnerActionKind,
): BrowserSkillRunnerCapability {
  if (actionKind === "observe" || actionKind === "extract") {
    return {
      actionKind,
      normalizedAction: actionKind,
      risk: "read-only",
      evidenceRequirement: "safe-summary",
      execution: "metadata-only",
    };
  }
  if (actionKind === "navigate-local") {
    return {
      actionKind,
      normalizedAction: "navigate-local",
      risk: "local-only",
      evidenceRequirement: "safe-summary",
      execution: "metadata-only",
    };
  }
  if (actionKind === "future-click" || actionKind === "future-type") {
    return {
      actionKind,
      normalizedAction: actionKind,
      risk: "state-changing-future",
      evidenceRequirement: "future-action-receipt",
      execution: "metadata-only",
    };
  }
  if (["auth", "payment", "destructive", "upload", "download", "arbitrary-js"].includes(actionKind)) {
    return {
      actionKind,
      normalizedAction: "unsupported",
      risk: "sensitive-blocked",
      evidenceRequirement: "blocked",
      execution: "metadata-only",
    };
  }
  return {
    actionKind,
    normalizedAction: "unsupported",
    risk: "unsupported",
    evidenceRequirement: "blocked",
    execution: "metadata-only",
  };
}

export function browserSkillRunnerAllowedActions(
  capabilities: readonly BrowserSkillRunnerCapability[],
): readonly BrowserExternalRunnerAction[] {
  return capabilities
    .map((capability) => capability.normalizedAction)
    .filter((action): action is BrowserExternalRunnerAction =>
      action === "observe" || action === "extract" || action === "navigate-local",
    );
}

export function browserSkillRunnerBlockedActions(
  capabilities: readonly BrowserSkillRunnerCapability[],
): readonly BrowserSkillRunnerActionKind[] {
  return capabilities
    .filter((capability) => capability.risk === "sensitive-blocked" || capability.risk === "unsupported")
    .map((capability) => capability.actionKind);
}
