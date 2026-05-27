import { sanitizeBrowserText } from "../../core/context/browserCapabilityModel.js";
import type { BrowserEvalBenchmarkScore } from "./benchmarkModel.js";

export interface BrowserEvalBenchmarkReport {
  readonly total: number;
  readonly passed: number;
  readonly skipped: number;
  readonly warnings: readonly string[];
  readonly score: number;
  readonly status: "passed" | "failed";
  readonly nextAction: string;
  readonly noProviderModelCalls: true;
  readonly noPublicNetwork: true;
  readonly lines: readonly string[];
}

export function createBrowserEvalBenchmarkReport(
  scores: readonly BrowserEvalBenchmarkScore[],
): BrowserEvalBenchmarkReport {
  const passed = scores.filter((score) => score.passed).length;
  const total = scores.length;
  return {
    total,
    passed,
    skipped: 0,
    warnings: scores.flatMap((score) => score.evidence.filter((item) => /blocked|failed|invalid|timed-out/i.test(item))).slice(0, 8),
    score: total === 0 ? 0 : passed / total,
    status: passed === total ? "passed" : "failed",
    nextAction: passed === total ? "Use gauntlet evidence for this controlled route." : "Inspect failed browser gauntlet tasks before widening runtime scope.",
    noProviderModelCalls: true,
    noPublicNetwork: true,
    lines: scores.map((score) => `${score.taskId}: ${score.passed ? "passed" : "failed"} (${score.score})`),
  };
}

export function renderBrowserEvalBenchmarkReport(report: BrowserEvalBenchmarkReport): string {
  return [
    "Browser eval benchmark",
    `- Status: ${report.status}`,
    `- Score: ${report.passed}/${report.total}`,
    `- Skipped: ${report.skipped}`,
    `- Warnings: ${report.warnings.length > 0 ? report.warnings.map((item) => sanitizeBrowserText(item, 100)).join("; ") : "none"}`,
    "- Provider/model call: none",
    "- Public network: no",
    `- Evidence summary: ${report.lines.map((line) => sanitizeBrowserText(line, 120)).join("; ")}`,
    `- Next action: ${sanitizeBrowserText(report.nextAction, 180)}`,
  ].join("\n");
}
