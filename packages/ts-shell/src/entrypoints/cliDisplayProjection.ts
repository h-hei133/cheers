import path from "node:path";

export function formatWorkspaceInfoLines(input: {
  readonly cwd: string;
  readonly projectRoot: string;
}): readonly string[] {
  return [
    "",
    `Current working directory: ${input.cwd}`,
    `Project root: ${input.projectRoot}`,
    "Use /cd <path> (or /workspace attach <path>) to switch target project.",
    "",
  ];
}

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

export function formatAgentModeStatusLines(input: {
  readonly agentMode: "plan" | "build";
}): readonly string[] {
  return [
    `\nCurrent agent mode: ${input.agentMode}`,
    "Use /plan for planning-oriented reasoning, or /build for coding/build execution (default).\n",
  ];
}

export function formatAgentModeUpdatedLines(input: {
  readonly agentMode: "plan" | "build";
}): readonly string[] {
  return [
    `\nAgent mode updated to ${input.agentMode}.`,
    input.agentMode === "plan"
      ? "Plan mode prioritizes planning and diagnosis over direct edits/tool execution."
      : "Build mode prioritizes direct coding workflow (read/search/edit/verify).",
    "",
  ];
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
