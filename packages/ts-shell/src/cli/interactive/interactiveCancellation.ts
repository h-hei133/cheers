import type { Interface as ReadlineInterface } from "node:readline";
import * as readline from "node:readline";

import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";

export const DOUBLE_ESC_CANCEL_WINDOW_MS = 3000;

export interface InteractiveCancellationInput {
  readonly stdin: NodeJS.ReadStream;
  readonly readline: ReadlineInterface;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly renderer: StreamingRenderer;
  readonly now?: () => number;
  readonly setTimeout?: typeof setTimeout;
}

export function installInteractiveCancellation(
  input: InteractiveCancellationInput,
): void {
  let pendingEscPressAt: number | null = null;
  const now = input.now ?? Date.now;
  const scheduleTimeout = input.setTimeout ?? setTimeout;

  readline.emitKeypressEvents(input.stdin, input.readline);
  if (!input.stdin.isTTY) {
    return;
  }

  input.stdin.on("keypress", (_str, key) => {
    if (!key || key.name !== "escape") {
      return;
    }
    if (!input.sessionRuntime.getCurrentRunController()) {
      return;
    }

    const currentTime = now();
    if (
      pendingEscPressAt &&
      currentTime - pendingEscPressAt <= DOUBLE_ESC_CANCEL_WINDOW_MS
    ) {
      pendingEscPressAt = null;
      input.sessionRuntime.cancelCurrentRun();
      input.renderer.renderLine(
        "\nCancellation requested (double Esc detected).",
      );
      return;
    }

    pendingEscPressAt = currentTime;
    input.renderer.renderLine(
      "\nPress Esc again within 3 seconds to cancel the current response.",
    );
    scheduleTimeout(() => {
      if (
        pendingEscPressAt &&
        now() - pendingEscPressAt >= DOUBLE_ESC_CANCEL_WINDOW_MS
      ) {
        pendingEscPressAt = null;
      }
    }, DOUBLE_ESC_CANCEL_WINDOW_MS + 100);
  });
}
