import type { Interface as ReadlineInterface } from "node:readline";

import { buildPersistentShellPrompt } from "../../entrypoints/cliInteractiveLoopState.js";

export function buildInteractivePromptChrome(input: {
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly agentMode: "plan" | "build";
}): string {
  return buildPersistentShellPrompt(input);
}

export function refreshInteractivePromptChrome(input: {
  readonly readline: ReadlineInterface | null;
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly agentMode: "plan" | "build";
}): void {
  if (!input.readline) {
    return;
  }
  input.readline.setPrompt(
    buildInteractivePromptChrome({
      projectRoot: input.projectRoot,
      sessionId: input.sessionId,
      agentMode: input.agentMode,
    }),
  );
}
