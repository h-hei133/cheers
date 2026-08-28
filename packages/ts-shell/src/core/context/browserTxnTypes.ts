import type { BrowserTxnPlannerDecision } from "./browserPlan.js";

export type BrowserTxnStatus = "success" | "stopped" | "failed";

export interface BrowserTxnStepSummary {
  readonly kind: string;
  readonly status: BrowserTxnStatus;
  readonly target: string;
  readonly summary: string;
  readonly reasonCode: string;
  readonly repairStatus?: "not-needed" | "attempted" | "succeeded" | "failed";
}

export interface BrowserTxnTraceStep {
  readonly index: number;
  readonly kind: string;
  readonly phase: "observation" | "action" | "extraction";
  readonly status: BrowserTxnStatus;
  readonly target: string;
  readonly summary: string;
  readonly reasonCode: string;
  readonly repairStatus?: "not-needed" | "attempted" | "succeeded" | "failed";
}

export interface BrowserTxnTrace {
  readonly traceId: string;
  readonly transactionId: string;
  readonly evidenceId: string;
  readonly controlledTarget: string;
  readonly plan: {
    readonly sequence: readonly string[];
    readonly plannerConfidence: string;
    readonly plannerReason: string;
    readonly repairAllowed: boolean;
    readonly policyLevel: string;
  };
  readonly steps: readonly BrowserTxnTraceStep[];
  readonly observations: readonly string[];
  readonly actions: readonly string[];
  readonly repair: {
    readonly status: "not-needed" | "attempted" | "succeeded" | "failed";
    readonly attempted: boolean;
    readonly evidence: readonly string[];
  };
  readonly final: {
    readonly status: BrowserTxnStatus;
    readonly summary: string;
    readonly reasonCode: string;
  };
  readonly cleanup: {
    readonly status: string;
    readonly evidence: readonly string[];
  };
  readonly redaction: {
    readonly status: string;
    readonly evidence: readonly string[];
  };
  readonly timing: {
    readonly durationMs: number;
    readonly budget: "bounded-transaction";
  };
  readonly boundaries: readonly string[];
}

export interface BrowserTxnResult {
  readonly status: BrowserTxnStatus;
  readonly transactionId: string;
  readonly controlledTarget: string;
  readonly planner: BrowserTxnPlannerDecision;
  readonly plannedSteps: readonly string[];
  readonly stepSummaries: readonly BrowserTxnStepSummary[];
  readonly finalSummary: string;
  readonly reasonCode: string;
  readonly cleanupStatus: string;
  readonly redactionStatus: string;
  readonly repairStatus: "not-needed" | "attempted" | "succeeded" | "failed";
  readonly durationMs: number;
  readonly evidenceId: string;
  readonly trace: BrowserTxnTrace;
  readonly nextActions: readonly string[];
  readonly evidence: readonly string[];
}
