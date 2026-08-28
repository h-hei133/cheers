export function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIdx = content.indexOf("\r\n");
  const lfIdx = content.indexOf("\n");
  if (lfIdx === -1) return "\n";
  if (crlfIdx === -1) return "\n";
  return crlfIdx < lfIdx ? "\r\n" : "\n";
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function restoreLineEndings(
  text: string,
  ending: "\r\n" | "\n",
): string {
  const lfText = normalizeToLF(text);
  return ending === "\r\n" ? lfText.replace(/\n/g, "\r\n") : lfText;
}

/**
 * Normalize text for fuzzy matching.
 * - NFKC unicode canonical decomposition
 * - Strip trailing whitespace per line
 * - Normalize smart quotes to ASCII equivalents
 * - Normalize Unicode dashes/hyphens to ASCII hyphen
 * - Normalize special Unicode spaces to regular space
 */
export function normalizeForFuzzyMatch(text: string): string {
  return (
    text
      .normalize("NFKC")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Smart single quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      // Smart double quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Various dashes/hyphens (en-dash, em-dash, figure dash, etc.)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
      // Special spaces (NBSP, em space, en space, thin space, etc.)
      .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ")
  );
}
