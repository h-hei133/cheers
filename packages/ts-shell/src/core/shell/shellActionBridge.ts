import type { ShellActionResult } from "../commands/types.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";

export type ResumeLikeShellAction = ShellActionResult & {
  action: "resume-session" | "continue-session";
};

export function isResumeLikeShellAction(
  slashResult: ShellActionResult | null | undefined,
): slashResult is ResumeLikeShellAction {
  return (
    slashResult?.kind === "shell-action" &&
    (slashResult.action === "continue-session" ||
      slashResult.action === "resume-session")
  );
}

export function isShellAction<TAction extends ShellActionResult["action"]>(
  slashResult: ShellActionResult | null | undefined,
  action: TAction,
): slashResult is ShellActionResult & { action: TAction } {
  return slashResult?.kind === "shell-action" && slashResult.action === action;
}

export function renderInteractiveOnlyShellActionBlocked(
  renderer: StreamingRenderer,
  input: { printMode: boolean },
): void {
  renderer.renderLine(input.printMode ? "Result" : "\nResult");
  renderer.renderLine("- Outcome: blocked");
  renderer.renderLine("- BlockerKind: command-not-allowlisted");
  renderer.renderLine("- Reason: This shell action is interactive-only.");
  renderer.renderLine(
    "- DoNext: Run this command in interactive shell mode or use /help for non-interactive-safe alternatives.",
  );
  if (!input.printMode) {
    renderer.renderLine("");
  }
}
