import type { Interface as ReadlineInterface } from "node:readline";
import { TUI, type TerminalFramePlan, type TerminalFrameProvider } from "../../presentation/tui/tui.js";
import { Editor } from "../../presentation/tui/editor.js";
import { SelectList } from "../../presentation/tui/selectList.js";
import { InputController } from "../../presentation/tui/inputController.js";
import { altScreen } from "../../presentation/tui/altScreen.js";
import { TranscriptContainer } from "../../presentation/tui/transcriptContainer.js";
import { formatStatusLine, type StatusLineState } from "../../presentation/tui/statusLine.js";
import { formatMinimalWelcomeBanner } from "../../presentation/tui/welcomeBanner.js";
import { getComposerStyle } from "../../presentation/tui/composer/registry.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { BUILTIN_SLASH_COMMANDS } from "../../presentation/tui/slashAutocomplete.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { handleShellClose } from "../../core/shell/signalHandlers.js";

export interface InteractiveModeOptions {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly logger: StructuredLogger;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly fallbackSessionId?: string;
  readonly initialMcpGateway: CliMcpGateway;
  readonly exit?: (code?: number) => never;
}

/**
 * Production InteractiveMode Coordinator
 * Replaces the old monolithic loop with a decoupled, event-driven TUI runtime.
 */
export class InteractiveMode implements TerminalFrameProvider {
  readonly tui = new TUI();
  readonly editor = new Editor();
  readonly selectList = new SelectList();
  readonly transcript = new TranscriptContainer();
  readonly stdinBuffer = new StdinBuffer();
  private readonly inputController: InputController;

  private isExecuting = false;
  private turnNumber = 0;
  private mcpGateway: CliMcpGateway;
  private currentHistoryBatchId = 0;
  private pendingHistoryBatch: string[] = [];

  constructor(private readonly options: InteractiveModeOptions) {
    this.mcpGateway = options.initialMcpGateway;
    this.tui.setFrameProvider(this);

    this.inputController = new InputController(this.editor, this.selectList, {
      onCancelRun: () => {
        this.options.sessionRuntime.cancelCurrentRun();
      },
      onExit: () => {
        this.tui.stop();
        handleShellClose({
          sessionRuntime: this.options.sessionRuntime,
          renderer: this.options.renderer,
          runtimeContext: this.options.runtimeContext,
          exit: this.options.exit,
        });
      },
      onSubmit: (text) => {
        this.handleSubmit(text);
      },
      onRequestRedraw: () => {
        this.tui.requestRender();
      },
    });

    this.setupInputHandling();
  }

  start(): void {
    if (process.stdout.isTTY) {
      altScreen.enter({ exitMode: "replay" });
    }
    this.tui.start();
  }
  stop(): void {
    this.tui.stop();
    if (process.stdout.isTTY) {
      altScreen.leave();
    }
  }

  renderFrame(dimensions: { rows: number; cols: number }): TerminalFramePlan {
    const totalRows = dimensions.rows || 24;
    const width = dimensions.cols || 80;
    const editorText = this.editor.getText();

    // 1. Update autocomplete state
    if (editorText.trim().startsWith("/")) {
      const query = editorText.trim().toLowerCase();
      const matches = BUILTIN_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(query)).map((c) => ({
        value: c.name,
        label: c.name,
        description: c.description,
      }));
      this.selectList.setItems(matches);
      this.inputController.setAutocompleteActive(matches.length > 0);
    } else {
      this.inputController.setAutocompleteActive(false);
    }

    // 2. Render Box Composer Chrome
    const style = getComposerStyle("box");
    const statusState: StatusLineState = {
      modelName: this.options.runtimeContext.runtimeConfig.providerCredentials?.[this.options.runtimeContext.runtimeConfig.provider]?.model || "default-model",
      gitBranch: this.options.runtimeContext.gitContext.branch ?? undefined,
      projectDir: this.options.runtimeContext.projectRoot,
      usedTokens: 0,
      contextWindow: this.options.runtimeContext.runtimeConfig.contextWindow ?? 64000,
    };

    const topBorder = style.renderTop({ width, topTitle: "Coding Agent" });
    const rowLines = this.editor.renderWithSentinel().map((line) =>
      style.renderRow({ text: line, width }),
    );
    const bottomBorder = style.renderBottom({ width, statusText: formatStatusLine(statusState, width - 8) });
    const hints = ["/help for commands", "Esc to cancel", "Tab autocomplete"];
    const hintLine = `\x1b[90m ${hints.join("  │  ")} \x1b[0m`;

    const composerLines = [topBorder, ...rowLines, bottomBorder, hintLine];

    // 3. Render Autocomplete Dropdown if active
    const menuLines = this.inputController.isAutocompleteActive()
      ? this.selectList.render(Math.min(width - 4, 60))
      : [];

    // 4. Calculate upper transcript available rows
    const bottomRows = composerLines.length + menuLines.length;
    const availableTranscriptRows = Math.max(0, totalRows - bottomRows);

    // 5. Build transcript view with welcome header
    const welcomeHeader = formatMinimalWelcomeBanner({
      workspaceRoot: this.options.runtimeContext.projectRoot,
      modelName: statusState.modelName,
      gitBranch: statusState.gitBranch,
    }).split("\n").filter(Boolean);

    const fullTranscript = [...welcomeHeader, "", ...this.transcript.render()];
    const visibleTranscript = fullTranscript.length > availableTranscriptRows
      ? fullTranscript.slice(-availableTranscriptRows)
      : fullTranscript;

    const viewport = [
      ...visibleTranscript,
      ...menuLines,
      ...composerLines,
    ];

    return {
      history: this.pendingHistoryBatch.length > 0
        ? { id: ++this.currentHistoryBatchId, lines: this.pendingHistoryBatch }
        : undefined,
      viewport,
    };
  }

  acknowledgeHistory(_id: number): void {
    this.pendingHistoryBatch = [];
  }

  private async handleSubmit(text: string): Promise<void> {
    this.isExecuting = true;
    this.transcript.appendUserPrompt(text);
    this.tui.requestRender();

    let outputBuffer = "";
    const capturingRenderer: StreamingRenderer = {
      renderLine(line: string) {
        outputBuffer += `${line}\n`;
      },
      render(chunk: string) {
        outputBuffer += chunk;
      },
    } as unknown as StreamingRenderer;

    const dummyRl = {
      close: () => this.tui.stop(),
      prompt: () => this.tui.requestRender(),
      pause() {},
      resume() {},
    } as unknown as ReadlineInterface;

    try {
      const result = await routeInteractiveCommand({
        prompt: text,
        readline: dummyRl,
        mcpGateway: this.mcpGateway,
        fallbackSessionId: this.options.fallbackSessionId,
        sessionManager: this.options.sessionManager,
        runtimeContext: this.options.runtimeContext,
        renderer: capturingRenderer,
        sessionRuntime: this.options.sessionRuntime,
        logger: this.options.logger,
        approvalTrustPolicy: this.options.approvalTrustPolicy,
        turnNumber: this.turnNumber,
        setActiveNonInteractiveApprovalMode: () => {},
      });
      this.turnNumber = result.turnNumber;

      if (outputBuffer.trim()) {
        const cmdName = text.startsWith("/") ? text.split(" ")[0] : "Agent";
        this.transcript.appendCommandResult(cmdName, outputBuffer.trim());
      }
    } finally {
      this.isExecuting = false;
      this.tui.requestRender();
    }
  }

  private setupInputHandling(): void {
    this.stdinBuffer.onKey((event) => {
      this.inputController.handleKey(event, this.isExecuting);
    });

    this.stdinBuffer.onPaste((pasted) => {
      if (this.isExecuting) return;
      this.editor.insert(pasted);
      this.tui.requestRender();
    });

    process.stdin.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.stdinBuffer.feed(text);
    });
  }
}
