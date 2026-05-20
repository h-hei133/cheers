import type { RuntimeReceipt, RuntimeCleanupState } from "./runtimeReceipt.js";
import type { ToolRedactionState } from "../tools/toolPolicyResult.js";

export interface RuntimeReceiptProjection {
  readonly resultSummary: string;
  readonly evidenceSummary: readonly string[];
  readonly transcriptSummary: string;
  readonly terminalSummary: string;
  readonly cleanupSummary: string;
  readonly timeoutSummary?: string;
  readonly stdoutSummary?: string;
  readonly stderrSummary?: string;
  readonly redactionStatus: ToolRedactionState;
}

export function projectRuntimeReceipt(receipt: RuntimeReceipt): RuntimeReceiptProjection {
  const reason = sanitizeRuntimeText(receipt.reason);
  const doNext = sanitizeRuntimeText(receipt.doNext);
  const evidenceSummary = receipt.evidence
    .map((entry) => sanitizeRuntimeText(entry, 180))
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
  const stdoutSummary = budgetRuntimeObservation(receipt.stdoutSummary);
  const stderrSummary = budgetRuntimeObservation(receipt.stderrSummary);
  const cleanupSummary = projectRuntimeCleanup(receipt.cleanup);
  const timeoutSummary = projectRuntimeTimeout(receipt);
  const redactionStatus = deriveRedactionStatus(receipt, [
    reason,
    doNext,
    cleanupSummary,
    timeoutSummary ?? "",
    stdoutSummary ?? "",
    stderrSummary ?? "",
    ...evidenceSummary,
  ]);
  const prefix = `${receipt.runtimeKind}:${receipt.result}:${receipt.reasonCode}`;

  return {
    resultSummary: `${prefix}: ${reason}`,
    evidenceSummary,
    transcriptSummary: sanitizeRuntimeText(
      `${prefix}; cleanup=${receipt.cleanup}; doNext=${doNext}; evidence=${evidenceSummary.length}`,
      260,
    ),
    terminalSummary: `${receipt.runtimeKind} ${receipt.result}: ${reason}. DoNext: ${doNext}`,
    cleanupSummary,
    timeoutSummary,
    stdoutSummary,
    stderrSummary,
    redactionStatus,
  };
}

export function projectRuntimeTranscriptSummary(receipt: RuntimeReceipt): string {
  return projectRuntimeReceipt(receipt).transcriptSummary;
}

export function projectRuntimeTerminalSummary(receipt: RuntimeReceipt): string {
  return projectRuntimeReceipt(receipt).terminalSummary;
}

export function projectRuntimeCleanup(cleanup: RuntimeCleanupState): string {
  switch (cleanup) {
    case "not-started":
      return "cleanup:not-started";
    case "not-needed":
      return "cleanup:not-needed";
    case "succeeded":
      return "cleanup:succeeded";
    case "failed":
      return "cleanup:failed";
    case "unknown":
      return "cleanup:unknown";
  }
}

export function projectRuntimeTimeout(receipt: Pick<RuntimeReceipt, "execution" | "durationMs" | "timeoutMs" | "signal">): string | undefined {
  if (receipt.execution !== "timed-out" && receipt.execution !== "cancelled") {
    return undefined;
  }
  const parts = [
    receipt.execution === "timed-out" ? "timeout" : "cancelled",
    typeof receipt.durationMs === "number" ? `durationMs=${receipt.durationMs}` : undefined,
    typeof receipt.timeoutMs === "number" ? `timeoutMs=${receipt.timeoutMs}` : undefined,
    receipt.signal ? `signal=${sanitizeRuntimeText(receipt.signal, 80)}` : undefined,
  ].filter(Boolean);
  return parts.join(";");
}

export function budgetRuntimeObservation(value: string | undefined, maxLength = 240): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const sanitized = sanitizeRuntimeText(value, maxLength);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function sanitizeRuntimeText(value: string, maxLength = 400): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/<body[\s\S]*?<\/body>/gi, "[raw-content-excluded]")
    .replace(/<script[\s\S]*?<\/script>/gi, "[raw-content-excluded]")
    .replace(/\b(raw\s+dom|raw\s+html|document\.cookie|localStorage|sessionStorage)\b/gi, "[raw-content-excluded]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[secret-redacted]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/([A-Za-z]:\\Users\\[^\\\s]+\\\.private-agents-real)[^"'`\s]*/gi, "[redacted-real-provider-home]")
    .replace(/(?:^|\n)(?:[^\n]{0,200}\n){40,}/g, "\n[long-output-excluded]\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function deriveRedactionStatus(
  receipt: RuntimeReceipt,
  sanitizedParts: readonly string[],
): ToolRedactionState {
  if (receipt.redaction === "failed") {
    return "failed";
  }

  const original = [
    receipt.reason,
    receipt.doNext,
    receipt.stdoutSummary ?? "",
    receipt.stderrSummary ?? "",
    ...receipt.evidence,
  ].join("\n");
  const sanitized = sanitizedParts.join("\n");
  return original === sanitized ? receipt.redaction : "redacted";
}
