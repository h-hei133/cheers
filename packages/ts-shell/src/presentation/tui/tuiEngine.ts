import { Terminal } from "./terminal.js";
import { DifferentialTerminalBuffer } from "./buffer.js";
import { renderPermissionDialog, type PermissionDialogProps } from "./components/permissionDialog.js";
import { renderToolCard, type ToolCardProps } from "./components/toolCard.js";
import { ThinkingWidget } from "./components/thinkingWidget.js";

export interface TuiScreenState {
  readonly title: string;
  readonly activeGoal?: string;
  readonly thinking?: ThinkingWidget;
  readonly activeTools: readonly ToolCardProps[];
  readonly modalDialog?: PermissionDialogProps;
  readonly logMessages: readonly string[];
}

/**
 * TuiEngine
 * Coordinates terminal state, double-buffered differential rendering, and interactive modal cards.
 */
export class TuiEngine {
  private readonly terminal: Terminal;
  private readonly buffer: DifferentialTerminalBuffer;
  private isAltScreenActive: boolean = false;
  private state: TuiScreenState = {
    title: "Coding Agents Interactive Terminal",
    activeTools: [],
    logMessages: [],
  };

  constructor(terminal: Terminal = new Terminal(), buffer: DifferentialTerminalBuffer = new DifferentialTerminalBuffer()) {
    this.terminal = terminal;
    this.buffer = buffer;
  }

  enter(): void {
    if (process.stdout.isTTY && !this.isAltScreenActive) {
      this.terminal.enterAltScreen();
      this.terminal.hideCursor();
      this.isAltScreenActive = true;
    }
  }

  exit(): void {
    if (this.isAltScreenActive) {
      this.terminal.showCursor();
      this.terminal.exitAltScreen();
      this.isAltScreenActive = false;
    }
  }

  updateState(partial: Partial<TuiScreenState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.render();
  }

  render(): string {
    const screenLines: string[] = [];
    const dims = this.terminal.getDimensions();
    const cols = dims.columns || 80;

    // 1. Header & Title Bar
    const headerLine = `\x1b[44;37;1m ${this.state.title.padEnd(cols - 2, " ")} \x1b[0m`;
    screenLines.push(headerLine);

    if (this.state.activeGoal) {
      screenLines.push(`\x1b[33m🎯 Goal:\x1b[0m ${this.state.activeGoal}`);
    }
    screenLines.push("");

    // 2. Active Modal Dialog (if any)
    if (this.state.modalDialog) {
      const dialogLines = renderPermissionDialog(this.state.modalDialog);
      screenLines.push(...dialogLines);
      screenLines.push("");
    }

    // 3. Thinking Widget (if active)
    if (this.state.thinking) {
      screenLines.push(this.state.thinking.render());
      screenLines.push("");
    }

    // 4. Active Tool Cards
    for (const tool of this.state.activeTools) {
      const cardLines = renderToolCard(tool);
      screenLines.push(...cardLines);
      screenLines.push("");
    }

    // 5. Recent Log Messages
    if (this.state.logMessages.length > 0) {
      const recent = this.state.logMessages.slice(-10);
      for (const msg of recent) {
        screenLines.push(msg);
      }
    }

    // 6. Draw differential screen buffer to TTY
    const diffCommands = this.buffer.render(screenLines);
    if (diffCommands && process.stdout.isTTY && this.isAltScreenActive) {
      process.stdout.write(diffCommands);
    }

    return diffCommands;
  }

  getState(): TuiScreenState {
    return this.state;
  }
}
