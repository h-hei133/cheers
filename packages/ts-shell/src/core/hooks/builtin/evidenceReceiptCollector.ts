import type { InProcessHookConfig, PostToolUsePayload } from "../types.js";

export interface ToolExecutionReceipt {
  readonly sessionId?: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly success: boolean;
  readonly timestamp: string;
  readonly summary: string;
}

const MAX_RECEIPTS_PER_SESSION = 500;
const sessionReceiptLedgers = new Map<string, ToolExecutionReceipt[]>();
const globalReceiptRingBuffer: ToolExecutionReceipt[] = [];

export function getSessionReceipts(sessionId?: string): readonly ToolExecutionReceipt[] {
  if (sessionId && sessionReceiptLedgers.has(sessionId)) {
    return sessionReceiptLedgers.get(sessionId)!;
  }
  return globalReceiptRingBuffer;
}

export function clearSessionReceipts(sessionId?: string): void {
  if (sessionId) {
    sessionReceiptLedgers.delete(sessionId);
  } else {
    sessionReceiptLedgers.clear();
    globalReceiptRingBuffer.length = 0;
  }
}

/**
 * Built-in Verification Hook: Evidence Receipt Collector
 * Gathers immutable receipts of tool executions bounded per session in a ring buffer.
 */
export function createEvidenceReceiptCollector(): InProcessHookConfig {
  return {
    event: "PostToolUse",
    name: "evidence-receipt-collector",
    matcher: "*",
    description: "Maintains a bounded in-memory ledger of verified tool execution receipts.",
    handler: async (payload) => {
      const p = payload as PostToolUsePayload;
      const receipt: ToolExecutionReceipt = {
        sessionId: p.sessionId,
        toolName: p.toolName,
        toolCallId: p.toolCallId,
        success: p.success,
        timestamp: p.timestamp,
        summary: p.output.slice(0, 100),
      };

      if (p.sessionId) {
        if (!sessionReceiptLedgers.has(p.sessionId)) {
          sessionReceiptLedgers.set(p.sessionId, []);
        }
        const ledger = sessionReceiptLedgers.get(p.sessionId)!;
        if (ledger.length >= MAX_RECEIPTS_PER_SESSION) {
          ledger.shift();
        }
        ledger.push(receipt);
      }

      if (globalReceiptRingBuffer.length >= MAX_RECEIPTS_PER_SESSION) {
        globalReceiptRingBuffer.shift();
      }
      globalReceiptRingBuffer.push(receipt);

      return null;
    },
  };
}
