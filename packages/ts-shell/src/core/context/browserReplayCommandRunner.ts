import type { BrowserActionCache } from "./browserActionCache.js";
import type { BrowserExecutor } from "./browserExecutor.js";
import { executeBrowserReplay } from "./browserReplayExecutor.js";
import { planBrowserReplay } from "./browserReplayPlanner.js";
import type { BrowserReplayCommandRequest } from "./browserReplayCommandContract.js";
import {
  renderBrowserReplayStatusSurface,
  renderBrowserReplaySurface,
} from "./browserReplaySurface.js";
import type { BrowserCliExecutionBridgeSummary } from "./browserCliExecutionBridge.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";

export interface BrowserReplayCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export async function runBrowserReplayCommand(input: {
  readonly request: BrowserReplayCommandRequest;
  readonly actionCache?: BrowserActionCache;
  readonly executor?: BrowserExecutor;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly cliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
  readonly now?: () => string;
}): Promise<BrowserReplayCommandRunResult> {
  if (input.request.mode === "status") {
    const summary = input.actionCache?.summary() ?? {
      entryCount: 0,
      visibleEntryCount: 0,
      persistence: "none" as const,
      replayExecution: "explicit-only" as const,
      evidence: ["browser-action-cache:missing-explicit-cache"],
    };
    const entries = input.actionCache?.list().map((entry) => ({
      sourceReceiptId: entry.sourceReceiptId,
      actionKind: entry.actionKind,
      replayStatus: entry.replayReadinessSnapshot.status,
    })) ?? [];
    return {
      output: renderBrowserReplayStatusSurface({
        entryCount: summary.entryCount,
        visibleEntryCount: summary.visibleEntryCount,
        entries,
      }),
      evidence: [
        ...summary.evidence,
        "browser-replay-command-runner:status",
        "browser-replay-command-runner:no-automatic-replay",
      ],
    };
  }
  const entry = input.request.receiptId && input.actionCache?.get(input.request.receiptId);
  const plan = planBrowserReplay({
    entry,
    sourceCommand: "/browser replay",
    runnerAvailable: Boolean(input.executor && input.executor.kind !== "noop"),
    skillRunnerBindingAvailable: Boolean(input.cliExecutionBridgeSummary?.skillRunnerBinding),
    sandboxConfirmed: Boolean(input.sandboxAuthority),
    allowlistConfirmed: Boolean(input.networkAllowlist),
    confirmationRecorded: Boolean(input.confirmations?.some((confirmation) => confirmation.status === "confirmed")),
  });
  const execution = await executeBrowserReplay({
    plan,
    executor: input.executor,
    sourceReceipt: entry ? input.actionCache?.getReceipt(entry.sourceReceiptId) : undefined,
    sandboxAuthority: input.sandboxAuthority,
    networkAllowlist: input.networkAllowlist,
    confirmations: input.confirmations,
    skillRunnerMetadata: input.cliExecutionBridgeSummary?.skillRunnerMetadata,
    skillRunnerReadiness: input.cliExecutionBridgeSummary?.skillRunnerReadiness,
    now: input.now,
  });
  return {
    output: renderBrowserReplaySurface({ plan, execution }),
    evidence: [
      ...plan.evidence,
      ...execution.evidence,
      "browser-replay-command-runner:explicit-replay",
      "browser-replay-command-runner:no-persistence",
    ],
  };
}
