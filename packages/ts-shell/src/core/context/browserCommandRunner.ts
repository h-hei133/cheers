import { classifyBrowserActionReadiness } from "./browserActionReadiness.js";
import { renderBrowserActionPreview } from "./browserActionPreview.js";
import { createBrowserCapabilityState, type BrowserCapabilityState } from "./browserCapabilityModel.js";
import { renderBrowserCapabilitySurface } from "./browserCapabilitySurface.js";
import type { BrowserCommandContract } from "./browserCommandContract.js";
import { runBrowserDryRunHarness } from "./browserDryRunHarness.js";
import { renderBrowserDryRunSurface } from "./browserDryRunSurface.js";

export interface BrowserCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export function runBrowserCommand(input: {
  readonly contract: BrowserCommandContract;
  readonly capability?: BrowserCapabilityState;
}): BrowserCommandRunResult {
  const capability = input.capability ?? createBrowserCapabilityState();
  if (input.contract.mode === "status") {
    return {
      output: renderBrowserCapabilitySurface(capability),
      evidence: [
        "browser-command-runner:status-preview-only",
        "browser-command-runner:no-browser-execution",
        "browser-command-runner:no-provider-or-model-call",
        "browser-command-runner:no-persistence",
      ],
    };
  }
  const action = input.contract.action;
  if (!action) {
    return {
      output: [
        "Result",
        "- Outcome: blocked",
        "- BlockerKind: invalid-browser-preview",
        "- Reason: Missing browser preview action.",
        "- DoNext: Use /browser preview navigate <url>, extract <goal>, click <target>, or type <target> <text>.",
      ].join("\n"),
      evidence: ["browser-command-runner:missing-preview-action"],
    };
  }
  if (input.contract.mode === "dry-run") {
    const dryRun = runBrowserDryRunHarness({ contract: action, capability });
    const surface = renderBrowserDryRunSurface(dryRun.plan);
    return {
      output: surface.output,
      evidence: [
        ...dryRun.evidence,
        ...surface.evidence,
        "browser-command-runner:dry-run",
        "browser-command-runner:no-browser-execution",
        "browser-command-runner:no-provider-or-model-call",
        "browser-command-runner:no-persistence",
      ],
    };
  }
  const readiness = classifyBrowserActionReadiness({ contract: action, capability });
  const preview = renderBrowserActionPreview({ contract: action, readiness, capability });
  return {
    output: preview.output,
    evidence: [
      ...preview.evidence,
      "browser-command-runner:preview-only",
      "browser-command-runner:no-browser-execution",
      "browser-command-runner:no-provider-or-model-call",
      "browser-command-runner:no-persistence",
    ],
  };
}
