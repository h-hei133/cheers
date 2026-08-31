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
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { Editor } from "../../presentation/tui/editor.js";
import { SelectList } from "../../presentation/tui/selectList.js";
import { InputController } from "../../presentation/tui/inputController.js";
import { BUILTIN_SLASH_COMMANDS } from "../../presentation/tui/slashAutocomplete.js";
import { InteractiveTuiSession } from "../../presentation/tui/interactiveTuiSession.js";

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
  const exit = input.exit ?? process.exit;
  let mcpGateway = input.initialMcpGateway;
  let interactiveTurnNumber = 0;
  let interactiveTurnInFlight = false;
  const editor = new Editor();
  const selectList = new SelectList();
  const stdinBuffer = new StdinBuffer();

  const getModelName = (): string => {
    return (
      input.runtimeContext.runtimeConfig.providerCredentials?.[input.runtimeContext.runtimeConfig.provider]?.model ||
      "default-model"
    );
  };

  const tuiSession = new InteractiveTuiSession({
    workspaceRoot: input.runtimeContext.projectRoot,
    modelName: getModelName(),
    gitBranch: input.runtimeContext.gitContext.branch ?? undefined,
    contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64000,
    exitMode: "replay",
  });

  const redrawTui = (): void => {
    const editorText = editor.getText();
    tuiSession.setPrompt(editorText);

    if (editorText.trim().startsWith("/")) {
      const query = editorText.trim().toLowerCase();
      const matches = BUILTIN_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(query)).map((c) => ({
        value: c.name,
        label: c.name,
        description: c.description,
      }));
      selectList.setItems(matches);
      inputController.setAutocompleteActive(matches.length > 0);
    } else {
      inputController.setAutocompleteActive(false);
    }

    const offset = editor.getCursorOffset();
    tuiSession.render(offset.col);
  };

  tuiSession.start();

  const dummyRl = {
    close() {
      tuiSession.stop();
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
      tuiSession.stop();
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
      tuiSession.setPrompt("");
      tuiSession.setExecutionState(true, "Executing...");
      tuiSession.appendUserPrompt(submittedText);

      try {
        let commandOutput = "";
        const capturingRenderer: StreamingRenderer = {
          renderLine(line: string) {
            commandOutput += `${line}\n`;
          },
          render(chunk: string) {
            commandOutput += chunk;
          },
        } as unknown as StreamingRenderer;

        const result = await routeInteractiveCommand({
          prompt: submittedText,
          readline: dummyRl,
          mcpGateway,
          fallbackSessionId: input.fallbackSessionId,
          sessionManager: input.sessionManager,
          runtimeContext: input.runtimeContext,
          renderer: capturingRenderer,
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

        if (commandOutput.trim()) {
          const firstWord = submittedText.split(" ")[0];
          tuiSession.appendCommandResult(firstWord, commandOutput.trim());
        }
      } finally {
        interactiveTurnInFlight = false;
        tuiSession.setExecutionState(false, "");
        redrawTui();
      }
    },
    onRequestRedraw: () => {
      redrawTui();
    },
  });

  // Connect raw stdin feed
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
