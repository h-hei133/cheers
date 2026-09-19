/**
 * The single report-safe scrubber.
 *
 * Every string that leaves this process in a report, receipt, evidence row, or
 * session record passes through here. It removes the real provider home path,
 * bearer tokens, credential assignments, known key shapes, and raw-content
 * markers (edit text, provider output, hidden reasoning, embedded HTML).
 *
 * This exists because the same eleven-rule chain was hand-copied into six
 * modules across three feature domains: `edit/sanitize.ts`,
 * `tools/toolOutcomeBundle.ts`, and the four `turn/` queue and bundle modules.
 * The copies were byte-identical, so nothing drifted yet - but adding a
 * redaction rule meant editing six files in three domains, and a missed copy
 * would have produced a leak path that no single review covered.
 *
 * The length limit stays a caller argument rather than a module constant:
 * callers pass 80, 120, 160, and 180 depending on the field they are scrubbing,
 * and that variation is deliberate.
 */
export function redactReportText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
