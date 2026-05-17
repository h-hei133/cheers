import type { BrowserExecutorKind } from "./browserExecutor.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  decideBrowserExecutionConfirmation,
  type BrowserExecutionConfirmationRecord,
} from "./browserExecutionConfirmation.js";
import { buildBrowserExecutionEvidencePolicy } from "./browserExecutionEvidencePolicy.js";
import type { BrowserExecutionPolicyDecision } from "./browserExecutionPolicy.js";
import {
  createBrowserNetworkAllowlist,
  decideBrowserNetworkAllowlist,
  type BrowserNetworkAllowlist,
  type BrowserNetworkDecision,
} from "./browserNetworkAllowlist.js";
import {
  createBrowserSandboxAuthority,
  decideBrowserSandboxAuthority,
  type BrowserSandboxAuthority,
  type BrowserSandboxAuthorityDecision,
} from "./browserSandboxAuthority.js";
import { createBrowserPlaywrightCliPlan } from "./browserPlaywrightCliAdapter.js";

export type BrowserRuntimePreflightStatus =
  | "pass"
  | "blocked"
  | "warning"
  | "future-runtime-required";

export interface BrowserRuntimePreflight {
  readonly preflightStatus: BrowserRuntimePreflightStatus;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly requiredConfirmations: readonly string[];
  readonly sandboxDecision: BrowserSandboxAuthorityDecision;
  readonly networkDecision: BrowserNetworkDecision;
  readonly confirmationDecision: ReturnType<typeof decideBrowserExecutionConfirmation>;
  readonly evidenceRequirements: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function runBrowserRuntimePreflight(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserExecutionPolicyDecision;
  readonly executorKind: BrowserExecutorKind;
  readonly authority?: BrowserSandboxAuthority;
  readonly allowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
}): BrowserRuntimePreflight {
  const authority = input.authority ?? createBrowserSandboxAuthority();
  const allowlist = input.allowlist ?? createBrowserNetworkAllowlist();
  const sandboxDecision = decideBrowserSandboxAuthority({
    request: input.request,
    authority,
  });
  const networkDecision = decideBrowserNetworkAllowlist({
    request: input.request,
    allowlist,
  });
  const confirmationDecision = decideBrowserExecutionConfirmation({
    request: input.request,
    confirmations: input.confirmations,
  });
  const evidencePolicy = buildBrowserExecutionEvidencePolicy({
    request: input.request,
  });
  const adapterPlan = createBrowserPlaywrightCliPlan(input.request);
  const blockers = [
    ...(!input.policy.allowed ? [input.policy.reason] : []),
    ...(sandboxDecision.status !== "allowed" ? [sandboxDecision.reason] : []),
    ...(networkDecision.status !== "allowed" ? [networkDecision.reason] : []),
    ...(!["not-required", "confirmed"].includes(confirmationDecision.status)
      ? [confirmationDecision.reason]
      : []),
    ...(input.executorKind === "fake-test" && authority.mode !== "fake-test"
      ? ["Fake/test executor requires fake-test sandbox authority."]
      : []),
  ];
  const futureRuntimeRequired =
    sandboxDecision.status === "future-runtime-required" ||
    input.policy.status === "future-runtime-required";
  const preflightStatus: BrowserRuntimePreflightStatus =
    blockers.length > 0
      ? futureRuntimeRequired
        ? "future-runtime-required"
        : "blocked"
      : input.policy.warnings.length > 0
        ? "warning"
        : "pass";
  return {
    preflightStatus,
    blockers,
    warnings: [
      ...input.policy.warnings,
      ...(preflightStatus === "warning" ? ["Preflight passed with warnings."] : []),
    ],
    requiredConfirmations: confirmationDecision.status === "required" ? [confirmationDecision.kind] : [],
    sandboxDecision,
    networkDecision,
    confirmationDecision,
    evidenceRequirements: evidencePolicy.requiredEvidence,
    nextAction: blockers[0]
      ? nextActionForBlocked({
          sandboxDecision,
          networkDecision,
          confirmationDecision,
          policy: input.policy,
        })
      : "Preflight passed; execute only through the injected non-default executor.",
    evidence: [
      ...sandboxDecision.evidence,
      ...networkDecision.evidence,
      ...confirmationDecision.evidence,
      ...evidencePolicy.evidence,
      ...adapterPlan.evidence,
      `browser-runtime-preflight:status:${preflightStatus}`,
      "browser-runtime-preflight:no-browser-launch",
      "browser-runtime-preflight:no-network-call",
      "browser-runtime-preflight:no-mcp-launch",
      "browser-runtime-preflight:no-provider-or-model-call",
    ],
  };
}

function nextActionForBlocked(input: {
  readonly sandboxDecision: BrowserSandboxAuthorityDecision;
  readonly networkDecision: BrowserNetworkDecision;
  readonly confirmationDecision: ReturnType<typeof decideBrowserExecutionConfirmation>;
  readonly policy: BrowserExecutionPolicyDecision;
}): string {
  if (!input.policy.allowed) {
    return input.policy.nextAction;
  }
  if (input.sandboxDecision.status !== "allowed") {
    return input.sandboxDecision.nextAction;
  }
  if (input.networkDecision.status !== "allowed") {
    return input.networkDecision.nextAction;
  }
  if (!["not-required", "confirmed"].includes(input.confirmationDecision.status)) {
    return input.confirmationDecision.nextAction;
  }
  return "Keep browser execution disabled until all gates pass.";
}
