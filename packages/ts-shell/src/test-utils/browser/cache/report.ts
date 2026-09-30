import type { BrowserCacheStressResult } from "./model.js";

export function renderBrowserCacheMultiprocessReport(result: BrowserCacheStressResult): string {
  return [
    "Browser cache multiprocess stress report",
    `- Scenario: ${result.scenarioId} ${result.name}`,
    `- Status: ${result.status}`,
    `- Processes: ${result.assertions.processCount}`,
    `- Roles: ${Array.from(new Set(result.processes.map((process) => process.role))).join(", ") || "none"}`,
    `- Exit summary: passed=${result.assertions.passedCount} blocked=${result.assertions.blockedCount} failed=${result.assertions.failedCount} timedOut=${result.assertions.timedOutCount}`,
    `- Lock: ${result.lock.status}${result.lock.operation ? `/${result.lock.operation}` : ""}`,
    `- Integrity: ${result.integrity.status}`,
    `- Records: valid=${result.integrity.validRecordCount} active=${result.integrity.activeCount} replayable=${result.integrity.replayableCount}`,
    `- Skipped: corrupt=${result.integrity.corruptedCount} unsafe=${result.integrity.unsafeCount} total=${result.integrity.skippedCount}`,
    `- Duplicates/over-budget: ${result.integrity.duplicateActiveCount}/${result.integrity.overBudgetCount}`,
    "- Persistence: explicit only",
    "- Raw evidence stored: no",
    "- Automatic replay: no",
    "- Provider/model call: none",
    `- Blockers/warnings: ${[...result.blockers, ...result.warnings, ...result.lock.warnings].join("; ") || "none"}`,
    `- Next action: ${result.nextAction}`,
  ].join("\n");
}
