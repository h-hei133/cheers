export interface PermissionDialogProps {
  readonly toolName: string;
  readonly target: string;
  readonly reason: string;
}

export function renderPermissionDialog(
  props: PermissionDialogProps,
): readonly string[] {
  // Box content width: 59 characters between borders (total outer width: 63)
  return [
    "┌─────────────────────────────────────────────────────────────┐",
    "│ \x1b[33;1m⚠️  PERMISSION REQUIRED\x1b[0m                                     │",
    "├─────────────────────────────────────────────────────────────┤",
    `│ Tool:   \x1b[1m${props.toolName.slice(0, 49).padEnd(49, " ")}\x1b[0m │`,
    `│ Target: \x1b[36m${props.target.slice(0, 49).padEnd(49, " ")}\x1b[0m │`,
    `│ Reason: ${props.reason.slice(0, 49).padEnd(49, " ")} │`,
    "├─────────────────────────────────────────────────────────────┤",
    "│ [y] Allow once  [a] Always allow  [n] Deny  [d] Deny always │",
    "└─────────────────────────────────────────────────────────────┘",
  ];
}
