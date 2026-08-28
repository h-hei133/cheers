export type LiveProviderTerminalClass =
  | "success"
  | "retryable-syntax-error"
  | "retryable-incomplete-patch"
  | "fatal-error";

export function shouldContractRetry(
  terminalClass: LiveProviderTerminalClass,
  attemptIndex: number,
  maxAttempts: number = 3,
): boolean {
  if (attemptIndex >= maxAttempts) {
    return false;
  }
  return (
    terminalClass === "retryable-syntax-error" ||
    terminalClass === "retryable-incomplete-patch"
  );
}

export function classifyDryRunFailure(
  errorMessage: string,
): LiveProviderTerminalClass {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes("hunk") ||
    normalized.includes("syntax") ||
    normalized.includes("parse")
  ) {
    return "retryable-syntax-error";
  }
  if (
    normalized.includes("incomplete") ||
    normalized.includes("truncated") ||
    normalized.includes("missing")
  ) {
    return "retryable-incomplete-patch";
  }
  return "fatal-error";
}
