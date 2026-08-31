import { altScreen, type AltScreenExitMode } from "./altScreen.js";
import { renderClaudeTuiFrame } from "./claudeLayout.js";
import { DifferentialTerminalBuffer } from "./buffer.js";

/**
 * Interactive TUI Session Coordinator (Claude Code / OMP mode)
 *
 * Coordinates:
 * 1. Alt-Screen Buffer lifecycle
 * 2. Differential frame updates with ANSI Mode 2026 atomic sync
 * 3. Real-time status chip & prompt gutter rendering
 */

export interface InteractiveTuiSessionOptions {
  readonly modelName?: string;
  readonly gitBranch?: string;
  readonly contextWindow?: number;
  readonly exitMode?: AltScreenExitMode;
}

export class InteractiveTuiSession {
  private readonly buffer = new DifferentialTerminalBuffer();
  private readonly modelName: string;
  private readonly gitBranch?: string;
  private readonly exitMode: AltScreenExitMode;
  private usedTokens = 0;
  private isExecuting = false;
  private activeToolStatus = "";
  private currentPrompt = "";

  constructor(options: InteractiveTuiSessionOptions = {}) {
    this.modelName = options.modelName ?? "claude-3.5-sonnet";
    this.gitBranch = options.gitBranch;
    this.exitMode = options.exitMode ?? "replay";
  }

  start(): void {
    altScreen.enter({ exitMode: this.exitMode });
    this.render();
  }

  stop(): void {
    altScreen.leave();
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

  render(): void {
    const width = process.stdout.columns || 80;
    const tokenStr = this.usedTokens > 0 ? `${Math.round(this.usedTokens / 1000)}k` : undefined;

    const frame = renderClaudeTuiFrame({
      width,
      promptText: this.currentPrompt,
      chip: {
        modelName: this.modelName,
        gitBranch: this.gitBranch,
        tokenUsage: tokenStr,
      },
      isExecuting: this.isExecuting,
      activeToolStatus: this.activeToolStatus,
    });

    const diffOutput = this.buffer.render(frame);
    if (diffOutput) {
      process.stdout.write(diffOutput);
    }
  }
}
