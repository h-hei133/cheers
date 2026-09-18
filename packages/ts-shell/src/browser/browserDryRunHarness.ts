import type { BrowserActionContract } from "./browserActionContract.js";
import { classifyBrowserActionReadiness } from "./browserActionReadiness.js";
import { createBrowserCapabilityState, type BrowserCapabilityState } from "./browserCapabilityModel.js";
import { createBrowserDryRunPlan, type BrowserDryRunPlan } from "./browserDryRunPlan.js";
import { decideBrowserRuntime } from "./runtime/core/decision.js";
import { classifyBrowserSandboxPolicy } from "./browserSandboxPolicy.js";

export interface BrowserDryRunHarnessInput {
  readonly contract: BrowserActionContract;
  readonly capability?: BrowserCapabilityState;
  readonly backendAvailable?: boolean;
  readonly now?: () => string;
  readonly nextId?: () => string;
}

export interface BrowserDryRunHarnessResult {
  readonly plan: BrowserDryRunPlan;
  readonly evidence: readonly string[];
}

export function runBrowserDryRunHarness(
  input: BrowserDryRunHarnessInput,
): BrowserDryRunHarnessResult {
  const capability = input.capability ?? createBrowserCapabilityState();
  const readiness = classifyBrowserActionReadiness({
    contract: input.contract,
    capability,
  });
  const runtime = decideBrowserRuntime({
    action: input.contract,
    requestedBackend: input.contract.requestedBackend,
    backendAvailable: input.backendAvailable,
  });
  const sandbox = classifyBrowserSandboxPolicy(input.contract);
  const plan = createBrowserDryRunPlan({
    requestedAction: input.contract,
    recommendedRuntime: runtime.recommendation,
    sandboxDecision: sandbox,
    readinessStatus: readiness.status,
    now: input.now,
    nextId: input.nextId,
  });
  return {
    plan,
    evidence: [
      ...readiness.evidence,
      ...runtime.evidence,
      ...sandbox.evidence,
      ...plan.evidence,
      "browser-dry-run-harness:non-executing",
      "browser-dry-run-harness:no-browser-launch",
      "browser-dry-run-harness:no-mcp-launch",
      "browser-dry-run-harness:no-network",
      "browser-dry-run-harness:no-provider-or-model-call",
    ],
  };
}
