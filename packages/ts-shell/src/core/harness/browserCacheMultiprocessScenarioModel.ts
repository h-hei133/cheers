import type { AgentCliProcessResult, AgentCliProcessSpec } from "../../test-utils/cli/model.js";
import type { BrowserReceiptCacheIntegrityStatus } from "../../browser/receipt/integrity.js";

export type BrowserCacheProcessRole =
  | "writer"
  | "replayer"
  | "status-reader"
  | "compactor"
  | "repairer"
  | "lock-holder";

export type BrowserCacheStressStatus = "passed" | "failed" | "blocked" | "skipped";

export interface BrowserCacheProcessStep {
  readonly id: string;
  readonly role: BrowserCacheProcessRole;
  readonly spec: AgentCliProcessSpec;
  readonly groupId?: string;
  readonly expectedBlocked?: boolean;
  readonly allowTimeout?: boolean;
  readonly readyFilePath?: string;
  readonly releaseFilePath?: string;
}

export interface BrowserCacheMultiprocessScenario {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly cacheRoot: string;
  readonly steps: readonly BrowserCacheProcessStep[];
  readonly expectedActiveRecords?: number;
  readonly expectedSkippedRecords?: number;
}

export interface BrowserCacheProcessResult {
  readonly stepId: string;
  readonly role: BrowserCacheProcessRole;
  readonly status: BrowserCacheStressStatus;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly outputLineCount: number;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
  readonly process: AgentCliProcessResult;
}

export interface BrowserCacheIntegritySummary {
  readonly status: BrowserReceiptCacheIntegrityStatus;
  readonly validRecordCount: number;
  readonly activeCount: number;
  readonly replayableCount: number;
  readonly corruptedCount: number;
  readonly unsafeCount: number;
  readonly skippedCount: number;
  readonly duplicateActiveCount: number;
  readonly overBudgetCount: number;
}

export interface BrowserCacheLockSummary {
  readonly status: string;
  readonly operation?: string;
  readonly warnings: readonly string[];
}

export interface BrowserCacheAssertionSummary {
  readonly processCount: number;
  readonly passedCount: number;
  readonly blockedCount: number;
  readonly failedCount: number;
  readonly timedOutCount: number;
  readonly rawLeakCount: number;
}

export interface BrowserCacheStressResult {
  readonly scenarioId: string;
  readonly name: string;
  readonly status: BrowserCacheStressStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly processes: readonly BrowserCacheProcessResult[];
  readonly integrity: BrowserCacheIntegritySummary;
  readonly lock: BrowserCacheLockSummary;
  readonly assertions: BrowserCacheAssertionSummary;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
  readonly nextAction: string;
  readonly redactions: readonly string[];
}

export function summarizeBrowserCacheStressStatus(input: {
  readonly processes: readonly BrowserCacheProcessResult[];
  readonly integrity: BrowserCacheIntegritySummary;
  readonly rawLeakCount: number;
}): BrowserCacheStressStatus {
  if (input.processes.some((process) => process.timedOut)) {
    return "blocked";
  }
  if (input.rawLeakCount > 0 || input.integrity.status === "unsafe" || input.integrity.status === "corrupted") {
    return "failed";
  }
  if (input.processes.some((process) => process.status === "failed")) {
    return "failed";
  }
  if (input.processes.every((process) => process.status === "skipped")) {
    return "skipped";
  }
  return "passed";
}
