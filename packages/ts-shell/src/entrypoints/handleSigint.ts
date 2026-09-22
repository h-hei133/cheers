import type { Interface } from "node:readline";
import type { SessionManager } from "../session/SessionManager.js";
import type { StreamingRenderer } from "../presentation/terminal/streaming.js";

export interface SigintContext {
  currentRunController: AbortController | null;
  renderer: StreamingRenderer;
  sessionManager: SessionManager;
  sessionId: string;
  readline: Pick<Interface, "close" | "prompt">;
  exit: (code: number) => never;
}

export function handleSigint(context: SigintContext): AbortController | null {
  if (context.currentRunController) {
    context.renderer.renderLine("\nRun cancelled by user (Ctrl+C)");
    context.currentRunController.abort();
    context.sessionManager.saveInterrupted(context.sessionId);
    context.readline.prompt();
    return null;
  }

  context.renderer.renderLine("\nExiting...");
  context.sessionManager.saveTerminated(context.sessionId);
  context.readline.close();
  context.exit(0);
}
