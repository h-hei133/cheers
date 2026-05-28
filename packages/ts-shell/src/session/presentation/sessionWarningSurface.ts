export function formatUnreadableSessionDirectoryWarning(input: {
  readonly sessionDirs: readonly string[];
}): string | undefined {
  if (input.sessionDirs.length === 0) {
    return undefined;
  }

  const sample = input.sessionDirs.slice(0, 3);
  const remainder = input.sessionDirs.length - sample.length;
  const suffix = remainder > 0 ? ` (+${remainder} more)` : "";
  const label = input.sessionDirs.length === 1 ? "directory" : "directories";
  return `Skipped ${input.sessionDirs.length} unreadable session ${label}: ${sample.join(", ")}${suffix}`;
}

export function formatListSessionsFailureWarning(input: {
  readonly sessionsDir: string;
  readonly error: unknown;
}): string {
  return `Failed to list sessions in ${input.sessionsDir}: ${input.error instanceof Error ? input.error.message : String(input.error)}`;
}
