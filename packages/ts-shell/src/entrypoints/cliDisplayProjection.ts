import path from "node:path";

export function formatViewModeStatusLines(input: {
  readonly viewMode: "compact" | "verbose";
}): readonly string[] {
  const activeMode = input.viewMode === "compact" ? "user" : "developer";
  return [
    `\nCurrent view mode: ${activeMode} (${input.viewMode})`,
    "Use /view user for product-style output, or /view developer for runtime-level diagnostics.\n",
  ];
}

export function formatViewModeUpdatedLine(input: {
  readonly viewMode: "compact" | "verbose";
}): string {
  const activeMode = input.viewMode === "compact" ? "user" : "developer";
  return `\nView mode updated to ${activeMode} (${input.viewMode}). Use /view status to inspect current mode.\n`;
}

export function projectPermissionListDisplay(input: {
  readonly projectRoot: string;
  readonly grantCount: number;
}): {
  readonly projectLabel: string;
  readonly grantCount: number;
  readonly emptyLines?: readonly string[];
} {
  return {
    projectLabel: path.basename(input.projectRoot) || input.projectRoot,
    grantCount: input.grantCount,
    emptyLines:
      input.grantCount === 0
        ? [
            "- No persisted allow-always grants for this project.",
            "- Use /permissions reset all to clear global grants if needed.",
            "",
          ]
        : undefined,
  };
}
