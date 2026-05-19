import type { ToolPolicyResultReceipt, ToolRedactionState } from "./toolPolicyResult.js";

export interface ToolResultProjection {
  readonly resultSummary: string;
  readonly evidenceSummary: readonly string[];
  readonly transcriptSummary: string;
  readonly terminalSummary: string;
  readonly redactionStatus: ToolRedactionState;
}

export function projectToolResult(
  receipt: ToolPolicyResultReceipt,
): ToolResultProjection {
  const reason = sanitizeToolResultText(receipt.reason);
  const doNext = sanitizeToolResultText(receipt.doNext);
  const evidenceSummary = receipt.evidence
    .map((entry) => sanitizeToolResultText(entry, 180))
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
  const redactionStatus = deriveRedactionStatus(receipt, [
    reason,
    doNext,
    ...evidenceSummary,
  ]);
  const prefix = `${receipt.label}:${receipt.result}:${receipt.reasonCode}`;

  return {
    resultSummary: `${prefix}: ${reason}`,
    evidenceSummary,
    transcriptSummary: sanitizeToolResultText(
      `${prefix}; doNext=${doNext}; evidence=${evidenceSummary.length}`,
      240,
    ),
    terminalSummary: `${receipt.label} ${receipt.result}: ${reason}. DoNext: ${doNext}`,
    redactionStatus,
  };
}

export function sanitizeToolResultText(value: string, maxLength = 400): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/<body[\s\S]*?<\/body>/gi, "[raw-content-excluded]")
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
  receipt: ToolPolicyResultReceipt,
  sanitizedParts: readonly string[],
): ToolRedactionState {
  if (receipt.redaction === "failed") {
    return "failed";
  }

  const original = [receipt.reason, receipt.doNext, ...receipt.evidence].join("\n");
  const sanitized = sanitizedParts.join("\n");
  return original === sanitized ? receipt.redaction : "redacted";
}
