import fs from "node:fs";

/**
 * Alternate Screen Buffer & Terminal Lifecycle Manager
 *
 * Implements:
 * 1. DECSET 1049 (\x1b[?1049h) - atomic switch to fresh isolated screen buffer
 * 2. DECRST 1049 (\x1b[?1049l) - clean return to primary buffer with cursor restore
 * 3. Synchronous unbuffered reset on process crash/exit (fs.writeSync to fd 1)
 * 4. Dual exit modes: clean revert vs scrollback transcript replay
 */

export type AltScreenExitMode = "clean" | "replay";

export interface AltScreenOptions {
  readonly exitMode?: AltScreenExitMode;
  readonly enableMouse?: boolean;
  readonly hideCursor?: boolean;
}

const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[2J\x1b[H";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const SHOW_CURSOR = "\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1004l\x1b[?1003l\x1b[?1002l\x1b[?1000l";
const RESET_STYLES = "\x1b[0m";

export class AltScreenManager {
  private static instance?: AltScreenManager;
  private isActive = false;
  private exitMode: AltScreenExitMode = "replay";
  private transcriptLines: string[] = [];
  private signalCleanupInstalled = false;

  constructor() {
    this.installSignalHandlers();
  }

  static getShared(): AltScreenManager {
    if (!AltScreenManager.instance) {
      AltScreenManager.instance = new AltScreenManager();
    }
    return AltScreenManager.instance;
  }

  enter(options: AltScreenOptions = {}): void {
    if (this.isActive) return;
    this.isActive = true;
    this.exitMode = options.exitMode ?? "replay";
    this.transcriptLines = [];

    const seq = [
      ENTER_ALT_SCREEN,
      ENABLE_BRACKETED_PASTE,
      options.hideCursor ? HIDE_CURSOR : SHOW_CURSOR,
    ].join("");

    this.writeSync(seq);

    try {
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(true);
      }
    } catch {
      // Best-effort raw mode
    }
  }

  recordTranscript(lines: readonly string[]): void {
    if (!this.isActive) return;
    this.transcriptLines.push(...lines);
  }

  leave(): void {
    if (!this.isActive) return;
    this.isActive = false;

    const resetSeq = [
      DISABLE_MOUSE,
      DISABLE_BRACKETED_PASTE,
      EXIT_ALT_SCREEN,
      SHOW_CURSOR,
      RESET_STYLES,
    ].join("");

    this.writeSync(resetSeq);

    try {
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
    } catch {
      // Best-effort cooked mode
    }

    // If replay mode requested, replay the final session transcript into the primary scrollback buffer
    if (this.exitMode === "replay" && this.transcriptLines.length > 0) {
      for (const line of this.transcriptLines) {
        process.stdout.write(`${line}\n`);
      }
      this.transcriptLines = [];
    }
  }

  isAltScreenActive(): boolean {
    return this.isActive;
  }

  private writeSync(data: string): void {
    try {
      fs.writeSync(1, Buffer.from(data));
    } catch {
      try {
        process.stdout.write(data);
      } catch {
        // Best-effort terminal write
      }
    }
  }

  private installSignalHandlers(): void {
    if (this.signalCleanupInstalled) return;
    this.signalCleanupInstalled = true;

    const emergencyCleanup = () => {
      if (this.isActive) {
        this.leave();
      }
    };

    process.once("exit", emergencyCleanup);
    process.once("SIGINT", emergencyCleanup);
    process.once("SIGTERM", emergencyCleanup);
    process.once("SIGHUP", emergencyCleanup);
    process.once("uncaughtException", emergencyCleanup);
  }
}

export const altScreen = AltScreenManager.getShared();
