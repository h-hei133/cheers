import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserDryRunPlan } from "./browserDryRunPlan.js";

export interface BrowserDryRunSurfaceResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export function renderBrowserDryRunSurface(plan: BrowserDryRunPlan): BrowserDryRunSurfaceResult {
  return {
    output: [
      "Browser dry-run",
      "Result",
      `- Outcome: ${plan.blockedReasons.length > 0 ? "blocked" : "dry-run-ready"}`,
      `- DryRunId: ${sanitizeBrowserText(plan.dryRunId, 80)}`,
      `- Requested action: ${plan.requestedAction.actionKind}`,
      `- Target: ${targetFor(plan)}`,
      `- Recommended future runtime: ${plan.recommendedRuntime.label}`,
      `- Runtime reason: ${plan.recommendedRuntime.reasons.join(", ")}`,
      `- Sandbox decision: ${plan.sandboxDecision.decision}`,
      `- Required confirmations: ${plan.requiredConfirmations.join("; ")}`,
      `- Expected evidence: ${plan.expectedEvidence.join("; ")}`,
      `- Blocked risks: ${plan.blockedReasons.length > 0 ? plan.blockedReasons.join("; ") : "none"}`,
      `- Warnings: ${plan.warnings.length > 0 ? plan.warnings.join("; ") : "none"}`,
      `- Next action: ${plan.nextAction}`,
      "- Executed: no",
      "- Browser process: not launched",
      "- MCP discovery/launch: none",
      "- Network access: none",
      "- External-network bridge: disabled by default",
      "- Provider/model call: none",
      "- Persistence: none",
      "- Raw content/secrets/hidden reasoning: excluded",
      "",
      "Planned steps:",
      ...plan.plannedSteps.map((step) =>
        `- ${step.order}. ${sanitizeBrowserText(step.label, 80)}: ${sanitizeBrowserText(step.detail)}`
      ),
    ].join("\n"),
    evidence: [
      ...plan.evidence,
      "browser-dry-run-surface:rendered",
      "browser-dry-run-surface:executed-no",
      "browser-dry-run-surface:sanitized",
    ],
  };
}

function targetFor(plan: BrowserDryRunPlan): string {
  const action = plan.requestedAction;
  if (action.actionKind === "type" && action.target) {
    return sanitizeBrowserText(`${action.target} with redacted text`, 160);
  }
  return sanitizeBrowserText(
    action.url ?? action.target ?? action.extractionGoal ?? "(none)",
    160,
  );
}
