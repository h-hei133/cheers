/**
 * Report-safe text redaction shared by the browser and presentation domains.
 *
 * This began as `sanitizeSidebarText` inside `presentation/sidebar/`, and
 * `browser/capabilityModel.ts` imported it to build `sanitizeBrowserText`. That
 * made the browser execution layer depend on the sidebar UI layer: a change to
 * sidebar rendering policy silently changed how every browser path scrubbed its
 * text, with no compile error, and `browser/` could not be reused or tested
 * without dragging `presentation/` along.
 *
 * It lives in `core/security/` because both domains may depend on `core/` while
 * neither may depend on the other. Placing the shared implementation in either
 * feature domain would recreate the same reversed edge.
 *
 * Scope: this strips the report-unsafe constructs the report contract names -
 * secret-shaped strings, credential labels, raw markers, raw-content labels and
 * hidden reasoning - and caps length. It is deliberately *not* the credential
 * scrubber in `core/security/redaction.ts`, which removes provider home paths,
 * bearer tokens and credential assignments. The two guard different surfaces and
 * stay separate.
 */

/**
 * Strips report-unsafe constructs from `value` and caps it at `maxLength`.
 *
 * `redactions` is mutated in place with the label of each category that fired,
 * so callers can report which redactions applied. It is optional and defaults to
 * a throwaway set, which is how callers that only want the text call it.
 */
export function redactUnsafeReportText(
  value: string,
  redactions: Set<string> = new Set(),
  maxLength = 280,
): string {
  const compact = value.replace(/\s+/g, " ").trim();
  let sanitized = compact
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, () => {
      redactions.add("secret-looking-token");
      return "[REDACTED_SECRET]";
    })
    .replace(/\b(api key|token|authorization|provider credential|provider config|secret)\b/gi, () => {
      redactions.add("secret-label");
      return "[REDACTED_SECRET_LABEL]";
    })
    .replace(/\bRAW_[A-Z0-9_]+\b/g, () => {
      redactions.add("raw-marker");
      return "[REDACTED_RAW]";
    })
    .replace(/\b(raw content|raw (file|recovery|content|memory|event) content)\b/gi, () => {
      redactions.add("raw-content-label");
      return "[REDACTED_RAW_CONTENT]";
    })
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, () => {
      redactions.add("hidden-reasoning-label");
      return "[REDACTED_REASONING]";
    });
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength - 3)}...`;
  }
  return sanitized;
}
