import type { BrowserCliExecutionBridgeSummary } from "./cliExecutionBridge.js";
import type { BrowserExecutionConfirmationRecord } from "./executionConfirmation.js";
import type { BrowserNetworkAllowlist } from "./networkAllowlist.js";
import type { BrowserReceiptCacheStore } from "./receipt/store.js";
import {
  executeBrowserSelfHealingApply,
} from "./selfHealingApplyExecutor.js";
import {
  inferBrowserSelfHealingProposalKindFromId,
  planBrowserSelfHealingApply,
} from "./selfHealingApplyPlan.js";
import {
  renderBrowserSelfHealingApplySurface,
  renderBrowserSelfHealingStatusSurface,
} from "./selfHealingApplySurface.js";
import type { BrowserSelfHealingCommandRequest } from "./selfHealingCommandContract.js";

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
