import { createBrowserExecutionResult, type BrowserExecutionResult } from "./browserExecutionResult.js";
import type { BrowserExecutionReceipt } from "./browserExecutionReceipt.js";
import {
  NOOP_BROWSER_EXECUTOR,
  blockedBrowserExecutorResult,
  browserExecutorIsAvailable,
  type BrowserExecutor,
} from "./browserExecutor.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import type { BrowserReplayPlan } from "./browserReplayPlanner.js";
import { runBrowserRuntimePreflight } from "./browser/runtime/core/preflight.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import type { BrowserSkillRunnerMetadata } from "./browser/skill/runner/metadata.js";
import type { BrowserSkillRunnerReadiness } from "./browser/skill/runner/readiness.js";

export interface BrowserReplayExecutionResult {
  readonly status: "executed" | "blocked" | "failed";
  readonly executed: boolean;
  readonly result?: BrowserExecutionResult;
  readonly receipt?: BrowserExecutionReceipt;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export async function executeBrowserReplay(input: {
  readonly plan: BrowserReplayPlan;
  readonly executor?: BrowserExecutor;
  readonly sourceReceipt?: BrowserExecutionReceipt;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly skillRunnerMetadata?: BrowserSkillRunnerMetadata;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
  readonly now?: () => string;
}): Promise<BrowserReplayExecutionResult> {
  if (!input.plan.willExecute || !input.plan.request || !input.sourceReceipt) {
    return blocked(input.plan.blockers, [
      ...input.plan.evidence,
      "browser-replay-executor:not-executed",
    ]);
  }
  const executor = input.executor ?? NOOP_BROWSER_EXECUTOR;
  if (!browserExecutorIsAvailable(executor)) {
    return blocked(["missing-current-runner"], [
      ...input.plan.evidence,
      "browser-replay-executor:missing-runner",
    ]);
  }
  const policy = decideBrowserExecutionPolicy({
    request: input.plan.request,
    executorAvailable: true,
  });
  const preflight = runBrowserRuntimePreflight({
    request: input.plan.request,
    policy,
    executorKind: executor.kind,
    authority: input.sandboxAuthority,
    allowlist: input.networkAllowlist,
    confirmations: input.confirmations,
  });
  if (!["pass", "warning"].includes(preflight.preflightStatus)) {
    return blocked(preflight.blockers.length > 0 ? preflight.blockers : [preflight.preflightStatus], [
      ...input.plan.evidence,
      ...preflight.evidence,
      "browser-replay-executor:preflight-blocked",
    ]);
  }
  const executorResult = policy.allowed
    ? await executor.execute(input.plan.request, { now: input.now })
    : blockedBrowserExecutorResult({
        request: input.plan.request,
        code: policy.status,
        message: policy.reason,
      });
  const result = createBrowserExecutionResult({
    request: input.plan.request,
    policy,
    executorResult,
    skillRunnerMetadata: input.skillRunnerMetadata,
    skillRunnerReadiness: input.skillRunnerReadiness,
    replaySourceReceipt: input.sourceReceipt,
    replayCacheEntryId: input.plan.cacheEntryId,
    now: input.now,
  });
  return {
    status: result.executed ? "executed" : result.outcome === "failed" ? "failed" : "blocked",
    executed: result.executed,
    result,
    receipt: result.receipt,
    blockers: result.executed ? [] : [result.executorResult.error?.code ?? result.receipt.status],
    warnings: result.warnings,
    evidence: [
      ...input.plan.evidence,
      ...preflight.evidence,
      ...result.evidence,
      "browser-replay-executor:explicit-only",
      "browser-replay-executor:revalidated-before-execution",
      "browser-replay-executor:no-persistence",
      "browser-replay-executor:no-provider-or-model-call",
    ],
  };
}

function blocked(
  blockers: readonly string[],
  evidence: readonly string[],
): BrowserReplayExecutionResult {
  return {
    status: "blocked",
    executed: false,
    blockers,
    warnings: [],
    evidence,
  };
}
