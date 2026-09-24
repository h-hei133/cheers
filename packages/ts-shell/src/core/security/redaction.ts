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
 * A later sweep found the same chain in three more modules -
 * `repair/handoff/boundary.ts`, `verification/result/boundary.ts` and
 * `context/rebuildInput.ts` - where it differed only in what it did *around*
 * the chain: those callers also want to know that a redaction fired and to
 * truncate with an ellipsis. That variation is now a parameter here rather than
 * a reason to keep a private copy, so the rule chain has exactly one home and a
 * new rule reaches every caller.
 *
 * The length limit stays a caller argument rather than a module constant:
 * callers pass 80, 120, 160, and 180 depending on the field they are scrubbing,
 * and that variation is deliberate.
 */

/**
 * Applies the shared rule chain and returns the scrubbed text.
 *
 * `redactions` is mutated in place with `unsafe-content` when any rule fired
 * and with `truncated` when the length cap cut the value. Callers that only
 * want the text pass nothing.
 *
 * Truncation is `slice` by default. Pass `{ ellipsis: true }` for the callers
 * that report a shortened value to a reader and signal the cut with a trailing
 * `...`. That form slices to `maxLength` and then appends the marker, so it
 * yields `maxLength + 3` characters - the behaviour the three consolidated
 * copies had, preserved exactly rather than "tidied" into a reserved tail.
 *
 * Pass `{ preserveLines: true }` for text whose line structure carries meaning,
 * such as a stack trace. The rules all still run — including the ones that match
 * across newlines, which is the point — but the final whitespace collapse keeps
 * newlines instead of folding the value onto one line. Scrubbing such a value
 * line by line instead would be wrong: it would put every line out of reach of
 * the cross-line rules, which is how a secret inside an `<html>` block survived
 * a scrub that removed the same block from the message beside it.
 */
export function redactReportText(
  value: string,
  maxLength: number,
  options: {
    readonly redactions?: Set<string>;
    readonly ellipsis?: boolean;
    readonly preserveLines?: boolean;
  } = {},
): string {
  const { redactions, ellipsis = false, preserveLines = false } = options;
  const scrubbed = applyRedactionRules(value);
  // Whether a rule fired, not whether the text changed. Collapsing whitespace
  // always changes the text, so comparing the final value reported "unsafe
  // content" for any message holding a newline or a double space — the marker
  // appeared on reports that had nothing to hide, which makes it useless as a
  // signal.
  const ruleFired = scrubbed !== value;

  // The whitespace collapse is what makes these values safe to put in a log line,
  // but a stack's line breaks are the reason to include it at all. Only the
  // horizontal whitespace is folded in that case, and blank-line runs are capped.
  let sanitized = (
    preserveLines
      ? scrubbed.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n")
      : scrubbed.replace(/\s+/g, " ")
  ).trim();

  if (redactions && ruleFired) {
    redactions.add("unsafe-content");
  }
  if (sanitized.length > maxLength) {
    sanitized = ellipsis
      ? `${sanitized.slice(0, maxLength)}...`
      : sanitized.slice(0, maxLength);
    redactions?.add("truncated");
  }
  return sanitized;
}

/**
 * The rule chain, with no whitespace handling and no length cap.
 *
 * Split out so the caller can tell "a rule matched" from "the whitespace was
 * tidied", which the final value cannot distinguish on its own.
 */
function applyRedactionRules(value: string): string {
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
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
}
