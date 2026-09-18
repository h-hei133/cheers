import fs from "node:fs";
import { createBrowserReceiptCacheManifest } from "../../browser/receipt/browserReceiptCacheManifest.js";
import { createBrowserReceiptCacheStore } from "../../browser/receipt/browserReceiptCacheStore.js";
import { scanBrowserReceiptCacheIntegrity } from "../../browser/receipt/browserReceiptCacheIntegrity.js";
import { readBrowserReceiptCacheLock } from "../../browser/receipt/browserReceiptCacheLock.js";
import { runAgentCliProcess } from "./agentCliProcess.js";
import { mergeCliEvidence } from "./agentCliScenarioModel.js";
import {
  summarizeBrowserCacheStressStatus,
  type BrowserCacheAssertionSummary,
  type BrowserCacheIntegritySummary,
  type BrowserCacheMultiprocessScenario,
  type BrowserCacheProcessResult,
  type BrowserCacheProcessStep,
  type BrowserCacheStressResult,
  type BrowserCacheStressStatus,
} from "./browserCacheMultiprocessScenarioModel.js";

const RAW_LEAK_PATTERN = /RAW_|SECRET|sk-[A-Za-z0-9]|<html|<\/html|hidden reasoning/i;

export async function runBrowserCacheMultiprocessScenario(input: {
  readonly scenario: BrowserCacheMultiprocessScenario;
  readonly now?: () => string;
}): Promise<BrowserCacheStressResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const processes: BrowserCacheProcessResult[] = [];
  for (const group of groupSteps(input.scenario.steps)) {
    const results = await runGroup(group);
    processes.push(...results);
  }
  const manifest = createBrowserReceiptCacheManifest({
    cacheRoot: input.scenario.cacheRoot,
    source: "cli-harness",
    allowedOperations: ["read", "write", "invalidate", "delete"],
    scope: "harness",
  });
  const store = createBrowserReceiptCacheStore({ manifest });
  const health = store.health();
  const integrity = scanBrowserReceiptCacheIntegrity({ manifest });
  const lock = readBrowserReceiptCacheLock(input.scenario.cacheRoot);
  const summary: BrowserCacheIntegritySummary = {
    status: integrity.integrityStatus,
    validRecordCount: integrity.validRecordCount,
    activeCount: integrity.activeCount,
    replayableCount: health.replayableCount,
    corruptedCount: integrity.invalidJsonCount + integrity.invalidRecordCount,
    unsafeCount: integrity.unsafeRecordCount,
    skippedCount: integrity.skippedCount,
    duplicateActiveCount: integrity.duplicateActiveCount,
    overBudgetCount: integrity.overBudgetCount,
  };
  const rawLeakCount = processes.filter((process) => RAW_LEAK_PATTERN.test(process.process.output.combined)).length;
  const assertions: BrowserCacheAssertionSummary = {
    processCount: processes.length,
    passedCount: processes.filter((process) => process.status === "passed").length,
    blockedCount: processes.filter((process) => process.status === "blocked").length,
    failedCount: processes.filter((process) => process.status === "failed").length,
    timedOutCount: processes.filter((process) => process.timedOut).length,
    rawLeakCount,
  };
  const status = summarizeBrowserCacheStressStatus({
    processes,
    integrity: summary,
    rawLeakCount,
  });
  const blockers = [
    ...(status === "failed" ? ["browser-cache-multiprocess:failed"] : []),
    ...(status === "blocked" ? ["browser-cache-multiprocess:blocked"] : []),
  ];
  return {
    scenarioId: input.scenario.id,
    name: input.scenario.name,
    status,
    startedAt,
    finishedAt: now(),
    processes,
    integrity: summary,
    lock: {
      status: lock.status,
      operation: lock.operation,
      warnings: lock.warnings,
    },
    assertions,
    warnings: Array.from(new Set(processes.flatMap((process) => process.warnings))),
    blockers,
    evidence: mergeCliEvidence([
      processes.flatMap((process) => process.evidence),
      integrity.evidence,
      lock.evidence,
      [
        "browser-cache-multiprocess-runner:real-cli-child-processes",
        "browser-cache-multiprocess-runner:explicit-cache-root",
        "browser-cache-multiprocess-runner:no-provider-model-call",
      ],
    ]),
    nextAction: status === "passed"
      ? "Use Route 111 for browser replay UX/report polish or self-healing design."
      : "Inspect process summaries and cache integrity before expanding browser replay.",
    redactions: Array.from(new Set(processes.flatMap((process) => process.process.redactions))),
  };
}

export function assertBrowserCacheStressSafe(result: BrowserCacheStressResult): readonly string[] {
  return [
    ...(result.assertions.rawLeakCount > 0 ? ["raw-output-leak"] : []),
    ...(result.integrity.status === "unsafe" ? ["unsafe-cache-records"] : []),
    ...(result.integrity.status === "corrupted" ? ["corrupted-cache-records"] : []),
    ...(result.assertions.timedOutCount > 0 ? ["process-timeout"] : []),
  ];
}

async function runStep(step: BrowserCacheProcessStep): Promise<BrowserCacheProcessResult> {
  const process = await runAgentCliProcess(step.spec);
  const outputBlocked = /Outcome:\s*blocked/i.test(process.output.combined);
  const failedExit = process.exitCode !== 0 && !step.allowTimeout;
  const status: BrowserCacheStressStatus = process.timedOut
    ? "blocked"
    : failedExit
      ? "failed"
      : outputBlocked && !step.expectedBlocked
        ? "blocked"
        : "passed";
  return {
    stepId: step.id,
    role: step.role,
    status,
    exitCode: process.exitCode,
    signal: process.signal,
    timedOut: process.timedOut,
    durationMs: process.durationMs,
    outputLineCount: process.output.combinedLineCount,
    warnings: process.warnings,
    evidence: [
      ...process.evidence,
      `browser-cache-multiprocess-runner:role:${step.role}`,
    ],
    process,
  };
}

async function runGroup(
  group: readonly BrowserCacheProcessStep[],
): Promise<readonly BrowserCacheProcessResult[]> {
  const lockHolders = group.filter((step) => step.role === "lock-holder");
  if (lockHolders.length === 0) {
    return Promise.all(group.map((step) => runStep(step)));
  }
  const lockHolderRuns = lockHolders.map((step) => runStep(step));
  await waitForReadyFiles(lockHolders.map((step) => step.readyFilePath));
  const otherSteps = group.filter((step) => step.role !== "lock-holder");
  const otherResults = await Promise.all(otherSteps.map((step) => runStep(step)));
  releaseLockHolders(lockHolders);
  const lockHolderResults = await Promise.all(lockHolderRuns);
  return [...lockHolderResults, ...otherResults];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyFiles(paths: readonly (string | undefined)[]): Promise<void> {
  const readyPaths = paths.filter((path): path is string => Boolean(path));
  if (readyPaths.length === 0) {
    await delay(250);
    return;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (readyPaths.every((path) => fs.existsSync(path))) {
      return;
    }
    await delay(20);
  }
}

function releaseLockHolders(steps: readonly BrowserCacheProcessStep[]): void {
  for (const step of steps) {
    if (!step.releaseFilePath) {
      continue;
    }
    fs.writeFileSync(step.releaseFilePath, "release\n", "utf8");
  }
}

function groupSteps(
  steps: readonly BrowserCacheProcessStep[],
): readonly (readonly BrowserCacheProcessStep[])[] {
  const groups: BrowserCacheProcessStep[][] = [];
  for (const step of steps) {
    const previous = groups.at(-1);
    if (previous?.[0]?.groupId && previous[0].groupId === step.groupId) {
      previous.push(step);
      continue;
    }
    groups.push([step]);
  }
  return groups;
}
