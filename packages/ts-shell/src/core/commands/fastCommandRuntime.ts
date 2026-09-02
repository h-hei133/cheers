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
        "### Fast mode is on",
        "",
        // What this actually changes is sampling temperature. It does not route to a
        // different model, and saying it did was a claim about the request that
        // nothing backed — use `/model` to change which model answers.
        "- Sampling: temperature is lowered, so answers are more direct and arrive sooner",
        "- Which model answers does not change — use `/model` for that",
        "",
        "`/fast off` restores the default sampling.",
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
        "- Sampling is back to the default temperature",
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
