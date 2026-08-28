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

  // Fatal unrecoverable errors (missing file on disk, access denied, etc.)
  if (
    normalized.includes("not found") ||
    normalized.includes("enoent") ||
    normalized.includes("permission denied") ||
    normalized.includes("unauthorized")
  ) {
    return "fatal-error";
  }

  // Syntax and formatting retryable errors
  if (
    normalized.includes("hunk") ||
    normalized.includes("syntax") ||
    normalized.includes("parse error") ||
    normalized.includes("invalid diff format")
  ) {
    return "retryable-syntax-error";
  }

  // Incomplete/truncated model generation retryable errors
  if (
    normalized.includes("incomplete patch") ||
    normalized.includes("unexpected eof") ||
    normalized.includes("truncated output")
  ) {
    return "retryable-incomplete-patch";
  }

  return "fatal-error";
}
