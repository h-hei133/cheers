import type { BrowserActionContract } from "./actionContract.js";
import type { BrowserActionReadiness } from "./actionReadiness.js";
import type { BrowserCapabilityState } from "./capabilityModel.js";
import { sanitizeBrowserText } from "./capabilityModel.js";

export interface BrowserActionPreview {
  readonly contract: BrowserActionContract;
  readonly readiness: BrowserActionReadiness;
  readonly capability: BrowserCapabilityState;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function renderBrowserActionPreview(input: {
  readonly contract: BrowserActionContract;
  readonly readiness: BrowserActionReadiness;
  readonly capability: BrowserCapabilityState;
}): BrowserActionPreview {
  const output = [
    "Browser action preview",
    "Result",
    `- Outcome: ${input.readiness.status === "supported-preview" ? "preview-only" : "blocked"}`,
    `- Action: ${input.contract.actionKind}`,
    `- Target: ${previewTarget(input.contract)}`,
    `- Risk: ${input.contract.risk}`,
    `- Readiness: ${input.readiness.status}`,
    `- Backend status: ${input.capability.activeBackend}; execution unavailable`,
    "- Executed: no",
    "- Browser process: not launched",
    "- Provider/model call: none",
    "- Persistence: none",
    `- Reason: ${sanitizeBrowserText(input.readiness.reason)}`,
    `- Future evidence: ${futureEvidence(input.contract.actionKind)}`,
    "- Confirmation if enabled later: explicit user approval required",
    `- DoNext: ${sanitizeBrowserText(input.readiness.nextAction)}`,
  ].join("\n");
  return {
    contract: input.contract,
    readiness: input.readiness,
    capability: input.capability,
    output,
    evidence: [
      "browser-action-preview:executed-no",
      "browser-action-preview:no-raw-content",
      "browser-action-preview:no-provider-or-model-call",
      "browser-action-preview:no-persistence",
    ],
  };
}

function futureEvidence(actionKind: BrowserActionContract["actionKind"]): string {
  switch (actionKind) {
    case "navigate":
      return "target URL, final URL, navigation result, sandbox id";
    case "click":
    case "type":
      return "target selector/role, action result, before/after state marker";
    case "extract":
    case "observe":
      return "bounded accessibility snapshot summary, not raw page content";
    default:
      return "future browser runtime evidence; unavailable in preview";
  }
}

function previewTarget(contract: BrowserActionContract): string {
  return sanitizeBrowserText(
    contract.url ??
      contract.target ??
      contract.extractionGoal ??
      contract.text ??
      "not supplied",
  );
}
