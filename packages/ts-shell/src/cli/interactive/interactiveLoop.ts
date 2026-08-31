import process from "node:process";
import type * as readline from "node:readline";

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
import { handleShellClose } from "../../core/shell/signalHandlers.js";
import { altScreen } from "../../presentation/tui/altScreen.js";
import { formatMinimalWelcomeBanner } from "../../presentation/tui/welcomeBanner.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { Editor } from "../../presentation/tui/editor.js";
import { SelectList } from "../../presentation/tui/selectList.js";
import { InputController } from "../../presentation/tui/inputController.js";
import { BUILTIN_SLASH_COMMANDS } from "../../presentation/tui/slashAutocomplete.js";
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

  const editor = new Editor();
  const selectList = new SelectList();
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

    if (editorText.trim().startsWith("/")) {
      const query = editorText.trim().toLowerCase();
      const matches = BUILTIN_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(query)).map((c) => ({
        value: c.name,
        label: c.name,
        description: c.description,
      }));
      selectList.setItems(matches);
      if (matches.length > 0) {
        inputController.setAutocompleteActive(true);
      }
    } else {
      inputController.setAutocompleteActive(false);
    }

    const frame = renderBoxFrame({
      width,
      promptText: editor.getText() || " ",
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

    if (inputController.isAutocompleteActive()) {
      const menuLines = selectList.render(Math.min(width - 4, 60));
      frame.push(...menuLines);
    }

    const offset = editor.getCursorOffset();
    const cursorRow = 1 + (interactiveTurnInFlight ? 1 : 0) + offset.line + 1;
    const cursorCol = 1 + 1 + 2 + offset.col + 1;

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

  const inputController = new InputController(editor, selectList, {
    onCancelRun: () => {
      input.sessionRuntime.cancelCurrentRun();
    },
    onExit: () => {
      handleShellClose({
        sessionRuntime: input.sessionRuntime,
        renderer: input.renderer,
        runtimeContext: input.runtimeContext,
        readline: dummyRl,
        exit,
      });
    },
    onSubmit: async (submittedText: string) => {
      interactiveTurnInFlight = true;
      redrawTui();

      try {
        const result = await routeInteractiveCommand({
          prompt: submittedText,
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
    },
    onRequestRedraw: () => {
      redrawTui();
    },
  });

  redrawTui();

  // 2. Connect raw stdin feed
  stdinBuffer.onKey((event) => {
    inputController.handleKey(event, interactiveTurnInFlight);
  });

  stdinBuffer.onPaste((pasted) => {
    if (interactiveTurnInFlight) return;
    editor.insert(pasted);
    redrawTui();
  });

  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stdinBuffer.feed(text);
  });
}
