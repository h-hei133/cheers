import { altScreen, type AltScreenExitMode } from "./altScreen.js";
import { renderBoxFrame } from "./boxComposer.js";
import { DifferentialTerminalBuffer } from "./buffer.js";
import { getSlashCommandSuggestions, renderSlashAutocompleteMenu } from "./slashAutocomplete.js";
import { TranscriptContainer } from "./transcriptContainer.js";
import { formatMinimalWelcomeBanner } from "./welcomeBanner.js";

/**
 * Unified Interactive TUI Session Coordinator
 *
 * Coordinates:
 * 1. Alt-Screen Buffer lifecycle
 * 2. Welcome Banner, Transcript history, Autocomplete popup, and Pinned Box Composer
 * 3. Differential frame updates with ANSI Mode 2026 atomic sync
 * 4. Hardware cursor absolute pinning in the active input box
 */
export interface InteractiveTuiSessionOptions {
  readonly workspaceRoot?: string;
  readonly modelName?: string;
  readonly gitBranch?: string;
  readonly contextWindow?: number;
  readonly exitMode?: AltScreenExitMode;
}

export class InteractiveTuiSession {
  readonly transcript = new TranscriptContainer();
  private readonly buffer = new DifferentialTerminalBuffer();
  private readonly workspaceRoot: string;
  private readonly modelName: string;
  private readonly gitBranch?: string;
  private readonly contextWindow: number;
  private readonly exitMode: AltScreenExitMode;
  private usedTokens = 0;
  private isExecuting = false;
  private activeToolStatus = "";
  private currentPrompt = "";

  constructor(options: InteractiveTuiSessionOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.modelName = options.modelName ?? "default-model";
    this.gitBranch = options.gitBranch;
    this.contextWindow = options.contextWindow ?? 64000;
    this.exitMode = options.exitMode ?? "replay";
  }

  start(): void {
    if (process.stdout.isTTY) {
      altScreen.enter({ exitMode: this.exitMode });
    }
    this.render();
  }

  stop(): void {
    if (process.stdout.isTTY) {
      altScreen.leave();
    }
  }

  setPrompt(text: string): void {
    this.currentPrompt = text;
    this.render();
  }

  setExecutionState(isExecuting: boolean, status: string = ""): void {
    this.isExecuting = isExecuting;
    this.activeToolStatus = status;
    this.render();
  }

  updateTokenUsage(usedTokens: number): void {
    this.usedTokens = usedTokens;
    this.render();
  }

  appendUserPrompt(text: string): void {
    this.transcript.appendUserPrompt(text);
    this.render();
  }

  appendCommandResult(commandName: string, outputText: string): void {
    this.transcript.appendCommandResult(commandName, outputText);
    this.render();
  }

  appendAssistantResponse(text: string): void {
    this.transcript.appendAssistantResponse(text);
    this.render();
  }

  appendToolResult(toolName: string, resultText: string, isDiff: boolean = false): void {
    this.transcript.appendToolResult(toolName, resultText, isDiff);
    this.render();
  }

  render(cursorColOffset: number = 0): void {
    const totalRows = process.stdout.rows || 24;
    const width = process.stdout.columns || 80;

    const frame: string[] = [];

    // 1. Box Composer frame
    const boxLines = renderBoxFrame({
      width,
      promptText: this.currentPrompt || " ",
      title: "Coding Agent",
      status: {
        modelName: this.modelName,
        gitBranch: this.gitBranch,
        projectDir: this.workspaceRoot,
        usedTokens: this.usedTokens,
        contextWindow: this.contextWindow,
      },
      isExecuting: this.isExecuting,
      activeToolStatus: this.activeToolStatus,
    });

    // 2. Slash Autocomplete Menu (if active)
    const menuLines: string[] = [];
    const slashSuggestions = getSlashCommandSuggestions(this.currentPrompt);
    if (slashSuggestions && slashSuggestions.length > 0) {
      menuLines.push(...renderSlashAutocompleteMenu(slashSuggestions, 0, Math.min(width - 4, 60)));
    }

    // 3. Calculate remaining rows for upper transcript area
    const bottomChromeRows = boxLines.length + menuLines.length;
    const availableTranscriptRows = Math.max(0, totalRows - bottomChromeRows);

    // 4. Render top welcome header + visible transcript history
    const welcomeHeader = formatMinimalWelcomeBanner({
      workspaceRoot: this.workspaceRoot,
      modelName: this.modelName,
      gitBranch: this.gitBranch,
    }).split("\n").filter(Boolean);

    const fullTranscript = [...welcomeHeader, "", ...this.transcript.render()];
    const visibleTranscript = fullTranscript.length > availableTranscriptRows
      ? fullTranscript.slice(-availableTranscriptRows)
      : fullTranscript;

    frame.push(...visibleTranscript);
    if (menuLines.length > 0) {
      frame.push(...menuLines);
    }
    frame.push(...boxLines);

    const frameHeight = frame.length;
    const topAnchor = Math.max(0, totalRows - frameHeight);

    // Calculate exact physical cursor position inside box composer
    const cursorRow = topAnchor + visibleTranscript.length + menuLines.length + (this.isExecuting ? 1 : 0) + 2;
    const cursorCol = 1 + 1 + 2 + cursorColOffset + 1; // │ + space + ❯ + space + offset + 1

    const diffOutput = this.buffer.render(frame, { row: cursorRow, col: cursorCol }, { topAnchor });
    if (diffOutput) {
      process.stdout.write(diffOutput);
    }
  }
}
