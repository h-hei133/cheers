import type { BrowserExecutionRequest } from "../../browser/browserExecutionContract.js";

export type BrowserEvalBenchmarkExpectation =
  | { readonly kind: "contains"; readonly text: string }
  | { readonly kind: "executed"; readonly value: boolean }
  | { readonly kind: "blocked"; readonly policyStatus: string };

export interface BrowserEvalBenchmarkTask {
  readonly taskId: string;
  readonly description: string;
  readonly request: BrowserExecutionRequest;
  readonly expectations: readonly BrowserEvalBenchmarkExpectation[];
}

export interface BrowserEvalBenchmarkScore {
  readonly taskId: string;
  readonly passed: boolean;
  readonly score: number;
  readonly evidence: readonly string[];
}
