export type StatusBadgeSeverity = "info" | "success" | "warning" | "error";

export function formatStatusBadge(
  label: string,
  severity: StatusBadgeSeverity = "info",
): string {
  const normalized = label.trim().toUpperCase();
  switch (severity) {
    case "success":
      return `\x1b[32m[✓ ${normalized}]\x1b[0m`;
    case "warning":
      return `\x1b[33m[! ${normalized}]\x1b[0m`;
    case "error":
      return `\x1b[31m[✗ ${normalized}]\x1b[0m`;
    case "info":
    default:
      return `\x1b[36m[ℹ ${normalized}]\x1b[0m`;
  }
}
