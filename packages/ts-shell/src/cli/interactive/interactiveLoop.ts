import process from "node:process";
import * as readline from "node:readline";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import {
  createCliMcpGateway,
  type CliMcpGateway,
} from "../../entrypoints/cliMcpModule.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { handleShellClose, handleShellSigint } from "../../core/shell/signalHandlers.js";
import { altScreen } from "../../presentation/tui/altScreen.js";
import { formatMinimalWelcomeBanner } from "../../presentation/tui/welcomeBanner.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { TextEditor } from "../../presentation/tui/textEditor.js";
import { AutocompleteController } from "../../presentation/tui/autocompleteController.js";
import { renderBoxFrame } from "../../presentation/tui/boxComposer.js";
import { DifferentialTerminalBuffer } from "../../presentation/tui/buffer.js";

export async function runInteractiveLoop(input: {
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly process?: NodeJS.Process;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly initialMcpGateway: CliMcpGateway;
  readonly setReadline: (readline: readline.Interface | null) => void;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  readonly exit?: (code?: number) => never;
}): Promise<void> {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  const exit = input.exit ?? process.exit;
  let mcpGateway = input.initialMcpGateway;
  let interactiveTurnNumber = 0;
  let interactiveTurnInFlight = false;

  const editor = new TextEditor();
  const autocomplete = new AutocompleteController();
  const diffBuffer = new DifferentialTerminalBuffer();
  const stdinBuffer = new StdinBuffer();

  const getModelName = (): string => {
    return (
      input.runtimeContext.runtimeConfig.providerCredentials?.[input.runtimeContext.runtimeConfig.provider]?.model ||
      "default-model"
    );
  };

  const redrawTui = (): void => {
    const width = stdout.columns || 80;
    const editorText = editor.getText();
    autocomplete.update(editorText);

    const frame = renderBoxFrame({
      width,
      promptText: editor.renderWithCursor().join("\n"),
      title: "Coding Agent",
      status: {
        modelName: getModelName(),
        gitBranch: input.runtimeContext.gitContext.branch ?? undefined,
        projectDir: input.runtimeContext.projectRoot,
        usedTokens: 0,
        contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64000,
      },
      isExecuting: interactiveTurnInFlight,
    });

    if (autocomplete.isActive()) {
      const menuLines = autocomplete.renderMenu(Math.min(width - 4, 60));
      frame.push(...menuLines);
    }

    const state = editor.getState();
    const cursorRow = 1 + (interactiveTurnInFlight ? 1 : 0) + state.cursorLine + 1;
    const cursorCol = 1 + 1 + 2 + state.cursorCol + 1;

    const diffOutput = diffBuffer.render(frame, { row: cursorRow, col: cursorCol });
    if (diffOutput) {
      stdout.write(diffOutput);
    }
  };

  // 1. Enter AltScreen Buffer and print minimal welcome
  if (stdout.isTTY) {
    altScreen.enter({ exitMode: "replay" });
    const welcome = formatMinimalWelcomeBanner({
      workspaceRoot: input.runtimeContext.projectRoot,
      modelName: getModelName(),
      gitBranch: input.runtimeContext.gitContext.branch ?? undefined,
    });
    stdout.write(welcome);
  }

  redrawTui();

  // Create dummy readline proxy for compatibility with existing command routers
  const dummyRl = {
    close() {
      altScreen.leave();
    },
    prompt() {
      redrawTui();
    },
    pause() {},
    resume() {},
  } as unknown as readline.Interface;
  input.setReadline(dummyRl);

  const refreshMcpGateway = (): void => {
    mcpGateway = createCliMcpGateway(input.runtimeContext.cwd);
  };

  // 2. Handle keypress events directly from StdinBuffer
  stdinBuffer.onKey(async (event) => {
    if (interactiveTurnInFlight) {
      if (event.keyId === "escape") {
        input.sessionRuntime.cancelCurrentRun();
      }
      return;
    }

    // A. Intercept keys if Autocomplete popup is active
    if (autocomplete.isActive()) {
      const consumed = autocomplete.handleKey(event, editor);
      if (consumed) {
        redrawTui();
        return;
      }
    }

    // B. Tab Autocomplete Interception (never insert raw \t)
    if (event.keyId === "tab") {
      if (autocomplete.isActive()) {
        autocomplete.handleKey(event, editor);
      } else if (editor.getText().trim().startsWith("/")) {
        autocomplete.update(editor.getText());
      }
      redrawTui();
      return;
    }

    // C. Escape Multi-Tier Cancellation Hierarchy (app.interrupt)
    if (event.keyId === "escape") {
      if (autocomplete.isActive()) {
        autocomplete.dismiss();
      }
      redrawTui();
      return;
    }
    if (event.keyId === "enter") {
      const submitted = editor.getText().trim();
      if (!submitted) {
        // Empty enter: No-op, do NOT scroll screen
        redrawTui();
        return;
      }

      editor.pushHistory(submitted);
      editor.clear();
      autocomplete.dismiss();
      interactiveTurnInFlight = true;
      redrawTui();

      try {
        const result = await routeInteractiveCommand({
          prompt: submitted,
          readline: dummyRl,
          mcpGateway,
          fallbackSessionId: input.fallbackSessionId,
          sessionManager: input.sessionManager,
          runtimeContext: input.runtimeContext,
          renderer: input.renderer,
          sessionRuntime: input.sessionRuntime,
          logger: input.logger,
          approvalTrustPolicy: input.approvalTrustPolicy,
          turnNumber: interactiveTurnNumber,
          setActiveNonInteractiveApprovalMode:
            input.setActiveNonInteractiveApprovalMode,
        });
        interactiveTurnNumber = result.turnNumber;
        if (result.refreshMcpGateway) {
          refreshMcpGateway();
        }
      } finally {
        interactiveTurnInFlight = false;
        redrawTui();
      }
      return;
    }

    if (event.keyId === "backspace") {
      editor.backspace();
      redrawTui();
      return;
    }

    if (event.keyId === "delete") {
      editor.delete();
      redrawTui();
      return;
    }

    if (event.keyId === "left") {
      editor.moveLeft();
      redrawTui();
      return;
    }

    if (event.keyId === "right") {
      editor.moveRight();
      redrawTui();
      return;
    }

    if (event.keyId === "up") {
      const moved = editor.moveUp();
      if (!moved) {
        editor.navigateHistory(-1);
      }
      redrawTui();
      return;
    }

    if (event.keyId === "down") {
      const moved = editor.moveDown();
      if (!moved) {
        editor.navigateHistory(1);
      }
      redrawTui();
      return;
    }

    if (event.keyId === "ctrl+a" || event.keyId === "home") {
      editor.moveToHome();
      redrawTui();
      return;
    }

    if (event.keyId === "ctrl+e" || event.keyId === "end") {
      editor.moveToEnd();
      redrawTui();
      return;
    }

    if (event.keyId === "alt+left" || event.keyId === "ctrl+left") {
      editor.moveWordLeft();
      redrawTui();
      return;
    }

    if (event.keyId === "alt+right" || event.keyId === "ctrl+right") {
      editor.moveWordRight();
      redrawTui();
      return;
    }

    if (event.keyId === "ctrl+c") {
      if (editor.getText().length > 0) {
        // Clear current prompt draft
        editor.clear();
        autocomplete.dismiss();
        redrawTui();
        return;
      }

      handleShellClose({
        sessionRuntime: input.sessionRuntime,
        renderer: input.renderer,
        runtimeContext: input.runtimeContext,
        readline: dummyRl,
        exit,
      });
      return;
    }

    if (event.keyId === "ctrl+d") {
      handleShellClose({
        sessionRuntime: input.sessionRuntime,
        renderer: input.renderer,
        runtimeContext: input.runtimeContext,
        readline: dummyRl,
        exit,
      });
      return;
    }

    // D. Printable Characters (strictly reject raw tab bytes)
    if (event.raw && !event.ctrl && !event.alt && !event.meta && event.raw.length === 1 && event.raw !== "\t") {
      editor.insertText(event.raw);
      redrawTui();
    }
  });

  stdinBuffer.onPaste((pasted) => {
    if (interactiveTurnInFlight) return;
    const clean = pasted.replace(/\t/g, "  ");
    editor.insertText(clean);
    redrawTui();
  });

  // 3. Connect raw stdin feed
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stdinBuffer.feed(text);
  });
}
