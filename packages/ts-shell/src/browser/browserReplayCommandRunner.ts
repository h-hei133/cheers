import type { BrowserActionCache } from "./browserActionCache.js";
import type { BrowserExecutor } from "./browserExecutor.js";
import { inspectBrowserReceiptCacheHealth } from "./receipt/browserReceiptCacheHealth.js";
import type { BrowserReceiptCacheStore } from "./receipt/browserReceiptCacheStore.js";
import { renderBrowserReceiptCacheSurface } from "./receipt/browserReceiptCacheSurface.js";
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
  readonly receiptCacheStore?: BrowserReceiptCacheStore;
  readonly executor?: BrowserExecutor;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly cliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
  readonly now?: () => string;
}): Promise<BrowserReplayCommandRunResult> {
  if (input.request.mode === "status" || input.request.mode === "cache-status") {
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
      output: [
        renderBrowserReplayStatusSurface({
          entryCount: summary.entryCount,
          visibleEntryCount: summary.visibleEntryCount,
          entries,
        }),
        "",
        renderBrowserReceiptCacheSurface({
          manifest: input.receiptCacheStore?.manifest,
          health: inspectBrowserReceiptCacheHealth(input.receiptCacheStore),
        }),
      ].join("\n"),
      evidence: [
        ...summary.evidence,
        ...inspectBrowserReceiptCacheHealth(input.receiptCacheStore).evidence,
        "browser-replay-command-runner:status",
        "browser-replay-command-runner:no-automatic-replay",
      ],
    };
  }
  if (input.request.mode === "cache-invalidate" || input.request.mode === "cache-delete") {
    const mutation = input.request.mode === "cache-invalidate"
      ? input.receiptCacheStore?.invalidate(input.request.receiptId ?? "", "explicit /browser replay cache invalidate")
      : input.receiptCacheStore?.delete(input.request.receiptId ?? "", "explicit /browser replay cache delete");
    return {
      output: [
        "Browser replay",
        "Result",
        `- Outcome: ${mutation?.changed ? input.request.mode.replace("cache-", "") : "blocked"}`,
        `- Receipt id: ${input.request.receiptId ?? "none"}`,
        `- Cache status: ${mutation?.record?.status ?? "missing"}`,
        "- Persistence: explicit only",
        "- Raw evidence stored: no",
        "- Automatic replay: no",
        `- Next action: ${mutation?.changed ? "Use /browser replay cache status to inspect cache health." : "Provide an explicit receipt cache with the requested operation allowed."}`,
      ].join("\n"),
      evidence: [
        ...(mutation?.evidence ?? ["browser-replay-command-runner:persistent-cache-mutation-blocked"]),
        "browser-replay-command-runner:explicit-cache-management",
      ],
    };
  }
  if (input.request.mode === "cache-compact" || input.request.mode === "cache-repair") {
    const maintenance = input.request.mode === "cache-compact"
      ? input.receiptCacheStore?.compact()
      : input.receiptCacheStore?.repair();
    const action = input.request.mode.replace("cache-", "");
    return {
      output: [
        "Browser replay",
        "Result",
        `- Outcome: ${maintenance?.blockers.length ? "blocked" : action}`,
        `- Cache action: ${action}`,
        `- Records before/after: ${maintenance?.report ? `${maintenance.report.recordsBefore}/${maintenance.report.recordsAfter}` : "none"}`,
        `- Records removed: ${maintenance?.report?.recordsRemoved ?? 0}`,
        `- Tombstones kept: ${maintenance?.report?.tombstonesKept ?? 0}`,
        "- Persistence: explicit only",
        "- Raw evidence stored: no",
        "- Automatic replay: no",
        `- Blockers/warnings: ${[...(maintenance?.blockers ?? []), ...(maintenance?.warnings ?? [])].join("; ") || "none"}`,
        `- Next action: ${maintenance?.report?.nextAction ?? "Provide an explicit writable receipt cache."}`,
      ].join("\n"),
      evidence: [
        ...(maintenance?.evidence ?? ["browser-replay-command-runner:persistent-cache-maintenance-blocked"]),
        "browser-replay-command-runner:explicit-cache-maintenance",
      ],
    };
  }
  const memoryEntry = input.request.receiptId && input.actionCache?.get(input.request.receiptId);
  const persistentRecord = !memoryEntry && input.request.receiptId
    ? input.receiptCacheStore?.get(input.request.receiptId)
    : undefined;
  const persistentListRecord = !persistentRecord && input.request.receiptId
    ? input.receiptCacheStore?.list().records.find((record) => record.receiptId === input.request.receiptId)
    : persistentRecord;
  const cacheHealth = inspectBrowserReceiptCacheHealth(input.receiptCacheStore);
  const entry = memoryEntry ?? persistentRecord?.cacheEntry;
  const sourceReceipt = entry
    ? input.actionCache?.getReceipt(entry.sourceReceiptId) ?? persistentRecord?.receipt
    : undefined;
  const plan = planBrowserReplay({
    entry,
    sourceCommand: "/browser replay",
    runnerAvailable: Boolean(input.executor && input.executor.kind !== "noop"),
    skillRunnerBindingAvailable: Boolean(input.cliExecutionBridgeSummary?.skillRunnerBinding),
    sandboxConfirmed: Boolean(input.sandboxAuthority),
    allowlistConfirmed: Boolean(input.networkAllowlist),
    confirmationRecorded: Boolean(input.confirmations?.some((confirmation) => confirmation.status === "confirmed")),
    cacheRecordStatus: persistentListRecord?.status,
    cacheIntegrityStatus: cacheHealth.integrityStatus,
    skillMetadataAvailable: Boolean(input.cliExecutionBridgeSummary?.skillRunnerMetadata),
  });
  const execution = await executeBrowserReplay({
    plan,
    executor: input.executor,
    sourceReceipt,
    sandboxAuthority: input.sandboxAuthority,
    networkAllowlist: input.networkAllowlist,
    confirmations: input.confirmations,
    skillRunnerMetadata: input.cliExecutionBridgeSummary?.skillRunnerMetadata,
    skillRunnerReadiness: input.cliExecutionBridgeSummary?.skillRunnerReadiness,
    now: input.now,
  });
  const persistentReplayWrite = execution.receipt?.replayReadiness.status === "replay-ready"
    ? input.receiptCacheStore?.writeReceipt(execution.receipt)
    : undefined;
  return {
    output: [
      renderBrowserReplaySurface({ plan, execution }),
      ...(input.receiptCacheStore
        ? [
            "",
            "Browser receipt cache",
            `- Cache source: ${persistentRecord ? "persistent" : "memory"}`,
            `- Cache write: ${persistentReplayWrite?.written ? "yes" : "no"}`,
            `- Cache status: ${persistentRecord?.status ?? "none"}`,
            "- Persistence: explicit only",
            "- Raw evidence stored: no",
          ]
        : []),
    ].join("\n"),
    evidence: [
      ...plan.evidence,
      ...execution.evidence,
      ...(persistentRecord ? ["browser-replay-command-runner:persistent-cache-read"] : []),
      ...(persistentReplayWrite?.evidence ?? []),
      "browser-replay-command-runner:explicit-replay",
      "browser-replay-command-runner:no-default-persistence",
    ],
  };
}
