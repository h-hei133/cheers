import type { RuntimeEvidenceSavePoint } from "../../evidence/runtimeSavePoint.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import type { RuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/executionReceipt.js";

export type RuntimeProjectionEventType =
  | "turn-snapshot-observed"
  | "phase-observed"
  | "execution-receipt-observed"
  | "tool-result-observed"
  | "save-point-observed"
  | "result-facts-observed"
  | "session-projection-observed"
  | "terminal-verdict-observed";

export interface RuntimeProjectionEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: RuntimeProjectionEventType;
  readonly facts: Record<string, unknown>;
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export interface RuntimeResultFactsProjection {
  readonly status?: string;
  readonly terminalClassification?: string;
  readonly terminalReason?: string;
  readonly verdictSource?: "result" | "evidence" | "unknown";
}

export function projectRuntimeEvents(input: {
  readonly turnSnapshot?: RuntimeTurnSnapshot;
  readonly executionReceipts?: readonly RuntimeExecutionReceiptProjection[];
  readonly toolResults?: readonly ToolExecutionResult[];
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly resultFacts?: RuntimeResultFactsProjection;
  readonly sessionProjection?: SessionTreeProjection;
}): readonly RuntimeProjectionEvent[] {
  const events: RuntimeProjectionEvent[] = [];
  const append = (
    type: RuntimeProjectionEventType,
    facts: Record<string, unknown>,
    notProvenClaims: readonly string[],
  ) => {
    const sequence = events.length + 1;
    const sanitized = sanitizeRecord(facts);
    events.push(
      deepFreeze({
        id: `runtime-event-${sequence}`,
        sequence,
        type,
        facts: sanitized.value,
        notProvenClaims,
        redaction: {
          status: sanitized.redacted ? "redacted" : "report-safe",
          excluded: REDACTION_EXCLUSIONS,
        },
      }),
    );
  };

  if (input.turnSnapshot) {
    append(
      "turn-snapshot-observed",
      {
        snapshotId: input.turnSnapshot.id,
        sessionId: input.turnSnapshot.sessionId,
        turn: input.turnSnapshot.turn,
        phase: input.turnSnapshot.phase,
        providerMode: input.turnSnapshot.provider.mode,
        providerOptIn: input.turnSnapshot.provider.optIn,
        executionBoundaryMode: input.turnSnapshot.executionBoundaryMode,
      },
      ["terminal-success"],
    );
    append(
      "phase-observed",
      {
        snapshotId: input.turnSnapshot.id,
        phase: input.turnSnapshot.phase,
      },
      ["terminal-success"],
    );
  }

  for (const receipt of input.executionReceipts ?? []) {
    append(
      "execution-receipt-observed",
      {
        receiptId: receipt.receiptId,
        turnSnapshotId: receipt.turnSnapshotId,
        savePointId: receipt.savePointId,
        operationKind: receipt.operationKind,
        executionStatus: receipt.executionStatus,
        errorClass: receipt.errorClass,
        exitCode: receipt.exitCode,
        evidenceCorrelationId: receipt.evidenceCorrelationId,
        redactionStatus: receipt.redaction.status,
      },
      receipt.notProvenClaims,
    );
  }

  for (const result of input.toolResults ?? []) {
    append(
      "tool-result-observed",
      {
        resultStatus: result.success
          ? "tool-success-observed"
          : "tool-failure-observed",
        reportSafe: result.reportSafe,
      },
      [
        "terminal-success",
        ...(result.reportSafe?.notProvenClaims ?? []),
      ],
    );
  }

  if (input.savePoint) {
    append(
      "save-point-observed",
      {
        savePointId: input.savePoint.id,
        turnSnapshotId: input.savePoint.turnSnapshotId,
        phase: input.savePoint.phase,
        sessionPersistenceStatus: input.savePoint.sessionPersistenceStatus,
        resultProjectionStatus: input.savePoint.resultProjectionStatus,
        terminalSuccessClaim: input.savePoint.terminalSuccessClaim,
        executionReceiptCount: input.savePoint.executionReceipts.length,
      },
      input.savePoint.notProvenClaims,
    );
  }

  if (input.resultFacts) {
    append(
      "result-facts-observed",
      {
        status: input.resultFacts.status,
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
        terminalSuccessClaim: false,
      },
      ["terminal-success"],
    );
    append(
      "terminal-verdict-observed",
      {
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
        terminalSuccessClaim: false,
      },
      ["terminal-success"],
    );
  }

  if (input.sessionProjection) {
    append(
      "session-projection-observed",
      {
        sessionIdentity: input.sessionProjection.sessionIdentity,
        activeLeafId: input.sessionProjection.activeLeafId,
        activePathLength: input.sessionProjection.activePath.length,
        treeSupport: input.sessionProjection.treeSupport,
        branchSupport: input.sessionProjection.branchSupport,
        continuationState: input.sessionProjection.continuation.state,
        terminalSuccessClaim: input.sessionProjection.terminal.terminalSuccessClaim,
      },
      input.sessionProjection.terminal.notProvenClaims,
    );
  }

  return deepFreeze(events);
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

function sanitizeRecord(input: Record<string, unknown>): {
  readonly value: Record<string, unknown>;
  readonly redacted: boolean;
} {
  let redacted = false;
  const value: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    const sanitized = sanitizeValue(rawValue);
    value[key] = sanitized.value;
    redacted = redacted || sanitized.redacted;
  }
  return { value, redacted };
}

function sanitizeValue(input: unknown): { readonly value: unknown; readonly redacted: boolean } {
  if (typeof input === "string") {
    return sanitizeText(input);
  }
  if (Array.isArray(input)) {
    let redacted = false;
    const value = input.map((item) => {
      const sanitized = sanitizeValue(item);
      redacted = redacted || sanitized.redacted;
      return sanitized.value;
    });
    return { value, redacted };
  }
  if (input && typeof input === "object") {
    let redacted = false;
    const value: Record<string, unknown> = {};
    for (const [key, valueInput] of Object.entries(input)) {
      const sanitized = sanitizeValue(valueInput);
      value[key] = sanitized.value;
      redacted = redacted || sanitized.redacted;
    }
    return { value, redacted };
  }
  return { value: input, redacted: false };
}

function sanitizeText(input: string): { readonly value: string; readonly redacted: boolean } {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]");
  value = value.replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
