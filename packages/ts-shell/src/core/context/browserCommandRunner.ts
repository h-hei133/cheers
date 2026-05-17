import { classifyBrowserActionReadiness } from "./browserActionReadiness.js";
import { renderBrowserActionPreview } from "./browserActionPreview.js";
import { createBrowserCapabilityState, type BrowserCapabilityState } from "./browserCapabilityModel.js";
import { renderBrowserCapabilitySurface } from "./browserCapabilitySurface.js";
import type { BrowserCommandContract } from "./browserCommandContract.js";
import {
  renderBrowserCliExecutionBridgeSummary,
  type BrowserCliExecutionBridgeSummary,
} from "./browserCliExecutionBridge.js";
import { runBrowserDryRunHarness } from "./browserDryRunHarness.js";
import { renderBrowserDryRunSurface } from "./browserDryRunSurface.js";
import {
  runBrowserExecutionCommand,
  type BrowserExecutionCommandRunResult,
} from "./browserExecutionCommandRunner.js";
import type { BrowserExecutor } from "./browserExecutor.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import { renderBrowserSkillRunnerSurface } from "./browserSkillRunnerSurface.js";

export interface BrowserCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export function runBrowserCommand(input: {
  readonly contract: BrowserCommandContract;
  readonly capability?: BrowserCapabilityState;
  readonly browserCliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
}): BrowserCommandRunResult {
  const capability = input.capability ?? createBrowserCapabilityState();
  if (input.contract.mode === "status") {
    return {
      output: [
        renderBrowserCapabilitySurface(capability),
        "",
        renderBrowserSkillRunnerSurface({
          metadata: input.browserCliExecutionBridgeSummary?.skillRunnerMetadata,
          readiness: input.browserCliExecutionBridgeSummary?.skillRunnerReadiness,
          fallbackReason: input.browserCliExecutionBridgeSummary?.reason,
        }),
        "",
        renderBrowserCliExecutionBridgeSummary(input.browserCliExecutionBridgeSummary),
      ].join("\n"),
      evidence: [
        "browser-command-runner:status-preview-only",
        ...(input.browserCliExecutionBridgeSummary?.evidence ?? []),
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

export async function runBrowserCommandAsync(input: {
  readonly contract: BrowserCommandContract;
  readonly capability?: BrowserCapabilityState;
  readonly browserExecutor?: BrowserExecutor;
  readonly browserSandboxAuthority?: BrowserSandboxAuthority;
  readonly browserNetworkAllowlist?: BrowserNetworkAllowlist;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly browserCliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
  readonly now?: () => string;
}): Promise<BrowserCommandRunResult | BrowserExecutionCommandRunResult> {
  if (input.contract.mode === "execute") {
    if (!input.contract.execution) {
      return {
        output: [
          "Result",
          "- Outcome: blocked",
          "- BlockerKind: invalid-browser-execute",
          "- Reason: Missing browser execution request.",
          "- DoNext: Use /browser execute navigate <url>, observe, or extract <goal>.",
        ].join("\n"),
        evidence: ["browser-command-runner:missing-execution-request"],
      };
    }
    return runBrowserExecutionCommand({
      request: input.contract.execution,
      executor: input.browserExecutor,
      sandboxAuthority: input.browserSandboxAuthority,
      networkAllowlist: input.browserNetworkAllowlist,
      confirmations: input.browserExecutionConfirmations,
      cliExecutionBridgeSummary: input.browserCliExecutionBridgeSummary,
      now: input.now,
    });
  }
  return runBrowserCommand({
    contract: input.contract,
    capability: input.capability,
    browserCliExecutionBridgeSummary: input.browserCliExecutionBridgeSummary,
  });
}
