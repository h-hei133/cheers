import type { CommandContext, LocalCommandResult } from "./types.js";

let isFastModeActive = false;

export function isFastModeEnabled(): boolean {
  return isFastModeActive;
}

export function setFastModeEnabled(enabled: boolean): void {
  isFastModeActive = enabled;
}

/**
 * /fast (aliases: /turbo, /speed)
 * Toggles or inspects fast mode to switch between high-capability and low-latency models.
 */
export async function runFastCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const modeArg = args[0]?.toLowerCase();

  if (modeArg === "on" || modeArg === "enable" || modeArg === "1") {
    isFastModeActive = true;
    return {
      kind: "local",
      output: [
        "# Fast Mode Activated (/fast on)",
        "",
        "- **Model Routing**: Prioritizing high-speed, cost-efficient models (e.g. DeepSeek-V4-Flash / Mini)",
        "- **Latency Profile**: Minimal delay (0.5s - 1.5s per turn)",
        "- **Best For**: Quick lookups, small edits, simple refactoring, and rapid code exploration",
        "",
        "Use `/fast off` to return to default full-reasoning capability model.",
      ].join("\n"),
    };
  }

  if (modeArg === "off" || modeArg === "disable" || modeArg === "0") {
    isFastModeActive = false;
    return {
      kind: "local",
      output: [
        "# Fast Mode Deactivated (/fast off)",
        "",
        "- **Model Routing**: Default full capability reasoning model",
        "- **Best For**: Complex multi-file architecture, subtle bugs, and rigorous code reviews",
      ].join("\n"),
    };
  }

  if (modeArg === "toggle") {
    isFastModeActive = !isFastModeActive;
  }

  return {
    kind: "local",
    output: [
      "# Fast Mode Status (/fast)",
      "",
      `- **Current State**: \`${isFastModeActive ? "ENABLED (TURBO)" : "DISABLED (DEFAULT)"}\``,
      "",
      "Usage:",
      "- `/fast on` : Switch to low-latency fast model tier",
      "- `/fast off` : Switch to default full capability tier",
      "- `/fast toggle` : Toggle between fast and default modes",
    ].join("\n"),
  };
}
