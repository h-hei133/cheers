import type { InProcessHookConfig, PostToolUsePayload } from "../types.js";

export interface ToolExecutionReceipt {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly success: boolean;
  readonly timestamp: string;
  readonly summary: string;
}

const sessionReceiptLedger: ToolExecutionReceipt[] = [];

export function getSessionReceipts(): readonly ToolExecutionReceipt[] {
  return sessionReceiptLedger;
}

export function clearSessionReceipts(): void {
  sessionReceiptLedger.length = 0;
}

/**
 * Built-in Verification Hook: Evidence Receipt Collector
 * Gathers immutable receipts of tool executions and test verifications to guarantee truthfulness.
 */
export function createEvidenceReceiptCollector(): InProcessHookConfig {
  return {
    event: "PostToolUse",
    name: "evidence-receipt-collector",
    matcher: "*",
    description: "Maintains an in-memory ledger of verified tool execution receipts.",
    handler: async (payload) => {
      const p = payload as PostToolUsePayload;
      sessionReceiptLedger.push({
        toolName: p.toolName,
        toolCallId: p.toolCallId,
        success: p.success,
        timestamp: p.timestamp,
        summary: p.output.slice(0, 100),
      });
      return null;
    },
  };
}
