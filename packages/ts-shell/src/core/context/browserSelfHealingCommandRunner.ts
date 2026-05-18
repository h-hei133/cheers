import type { BrowserCliExecutionBridgeSummary } from "./browserCliExecutionBridge.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import type { BrowserReceiptCacheStore } from "./browserReceiptCacheStore.js";
import {
  executeBrowserSelfHealingApply,
} from "./browserSelfHealingApplyExecutor.js";
import {
  inferBrowserSelfHealingProposalKindFromId,
  planBrowserSelfHealingApply,
} from "./browserSelfHealingApplyPlan.js";
import {
  renderBrowserSelfHealingApplySurface,
  renderBrowserSelfHealingStatusSurface,
} from "./browserSelfHealingApplySurface.js";
import type { BrowserSelfHealingCommandRequest } from "./browserSelfHealingCommandContract.js";

export interface BrowserSelfHealingCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export function runBrowserSelfHealingCommand(input: {
  readonly request: BrowserSelfHealingCommandRequest;
  readonly receiptCacheStore?: BrowserReceiptCacheStore;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly cliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
}): BrowserSelfHealingCommandRunResult {
  if (input.request.mode === "status") {
    return {
      output: renderBrowserSelfHealingStatusSurface(),
      evidence: [
        "browser-self-healing-command-runner:status",
        "browser-self-healing-command-runner:no-browser-execution",
        "browser-self-healing-command-runner:no-automatic-replay",
      ],
    };
  }
  const proposalKind = inferBrowserSelfHealingProposalKindFromId(input.request.proposalId ?? "");
  const plan = planBrowserSelfHealingApply({
    proposalId: input.request.proposalId ?? "none",
    proposalKind,
    hasExplicitCacheContext: Boolean(input.receiptCacheStore),
    hasExplicitManifestContext: Boolean(input.request.manifestPath || input.cliExecutionBridgeSummary?.manifestStatus === "valid"),
    hasExplicitConfirmationContext: Boolean(input.confirmations),
    hasExplicitAllowlistContext: Boolean(input.request.manifestPath || input.networkAllowlist),
    userConfirmed: input.request.userConfirmed,
  });
  const result = executeBrowserSelfHealingApply({
    plan,
    receiptCacheStore: input.receiptCacheStore,
    manifestPath: input.request.manifestPath,
  });
  return {
    output: renderBrowserSelfHealingApplySurface({ plan, result }),
    evidence: [
      ...result.evidence,
      "browser-self-healing-command-runner:apply",
      "browser-self-healing-command-runner:explicit-proposal-id",
      "browser-self-healing-command-runner:no-browser-execution",
      "browser-self-healing-command-runner:no-automatic-replay",
    ],
  };
}
