import { sanitizeBrowserText } from "../context/browserCapabilityModel.js";
import type { BrowserEvalBenchmarkScore } from "./browserEvalBenchmarkModel.js";

export interface BrowserEvalBenchmarkReport {
  readonly total: number;
  readonly passed: number;
  readonly score: number;
  readonly status: "passed" | "failed";
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
    score: total === 0 ? 0 : passed / total,
    status: passed === total ? "passed" : "failed",
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
    "- Provider/model call: none",
    "- Public network: no",
    `- Evidence summary: ${report.lines.map((line) => sanitizeBrowserText(line, 120)).join("; ")}`,
  ].join("\n");
}
