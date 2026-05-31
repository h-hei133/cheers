import { sanitizeBrowserText } from "../../../browserCapabilityModel.js";
import {
  decideBrowserExternalRunnerPolicy,
  type BrowserExternalRunnerDecision,
} from "../external/policy.js";
import {
  decideBrowserRuntimeDependencyPolicy,
  type BrowserRuntimeDependencyPolicy,
} from "./dependencyPolicy.js";

export interface BrowserRuntimeAvailabilitySurfaceInput {
  readonly dependencyPolicy?: BrowserRuntimeDependencyPolicy;
  readonly availability?: string;
  readonly externalRunnerDecision?: BrowserExternalRunnerDecision;
  readonly currentMode?: string;
  readonly nextAction?: string;
}

export function renderBrowserRuntimeAvailabilitySurface(
  input: BrowserRuntimeAvailabilitySurfaceInput = {},
): string {
  const dependency = input.dependencyPolicy ?? decideBrowserRuntimeDependencyPolicy();
  const runner = input.externalRunnerDecision ?? decideBrowserExternalRunnerPolicy();
  const blockers = [
    ...dependency.decision.risks,
    ...(runner.allowed ? [] : [runner.status]),
  ].map((item) => sanitizeBrowserText(item, 80));
  return [
    "Browser runtime dependency",
    `- Decision: ${dependency.decision.mode}`,
    `- Availability: ${sanitizeBrowserText(input.availability ?? "unavailable", 80)}`,
    `- External runner policy: ${runner.status}`,
    `- Current mode: ${sanitizeBrowserText(input.currentMode ?? "disabled", 80)}`,
    "- Browser execution default: disabled",
    `- Package mutation: ${dependency.packageMutation}`,
    `- Browser binary install: ${dependency.browserBinaryInstall}`,
    "- Network/MCP/provider/model: none",
    `- Next action: ${sanitizeBrowserText(input.nextAction ?? runner.nextAction ?? dependency.decision.nextAction, 180)}`,
    `- Risks/blockers: ${blockers.length === 0 ? "none" : blockers.join(", ")}`,
  ].join("\n");
}

export function browserRuntimeDependencySummary(
  policy: BrowserRuntimeDependencyPolicy = decideBrowserRuntimeDependencyPolicy(),
): string {
  return `${policy.decision.mode}; packageMutation=${policy.packageMutation}; defaultExecution=${policy.defaultBrowserExecution}`;
}
