export function detectVerifyCommand(
  normalizedPrompt: string,
): string | undefined {
  if (
    normalizedPrompt.includes("node --version") ||
    normalizedPrompt.includes("node version")
  ) {
    return "node --version";
  }
  if (/(test|\u6d4b\u8bd5)/i.test(normalizedPrompt)) {
    return "npm test -- --help";
  }
  if (
    /(build|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(normalizedPrompt)
  ) {
    return "npm run build -- --help";
  }
  return undefined;
}

export function hasExternalVerifyOptOut(prompt: string): boolean {
  return /\b(?:do\s+not|don't|without|no)\s+(?:run\s+)?(?:npm|tests?|build|cargo|external\s+commands?)\b/i.test(
    prompt,
  );
}

export function isVerifyLikeCommand(command: string): boolean {
  return /(?:\bverify\b|\btest\b|\btests?\b|\bbuild\b|\blint\b|\bcheck\b|npm\s+test|npm\s+run\s+build|pnpm\s+test|yarn\s+test|vitest|jest|pytest|cargo\s+test|go\s+test)/i.test(
    command,
  );
}
