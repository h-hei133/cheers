import fs from "node:fs";
import { detectTerminalCapabilities, type TerminalCapabilities } from "./terminalCapabilities.js";

const MAX_BACKLOG_BYTES = 64 * 1024 * 1024;

type InputHandler = (data: string) => void;
type ResizeHandler = () => void;
type DisconnectHandler = () => void;

export class Terminal {
  readonly capabilities: TerminalCapabilities;
  private wasRaw = false;
  private started = false;
  private disconnected = false;
  private pendingOutputBytes = 0;
  private readonly inputHandlers: InputHandler[] = [];
  private readonly resizeHandlers: ResizeHandler[] = [];
  private readonly disconnectHandlers: DisconnectHandler[] = [];

  constructor() {
    this.capabilities = detectTerminalCapabilities();
  }

  start(onInput: InputHandler, onResize: ResizeHandler, onDisconnect: DisconnectHandler): void {
    this.started = true;
    this.disconnected = false;
    this.inputHandlers.push(onInput);
    this.resizeHandlers.push(onResize);
    this.disconnectHandlers.push(onDisconnect);

    if (process.stdin.isTTY) {
      this.wasRaw = Boolean(process.stdin.isRaw);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        for (const handler of this.inputHandlers) {
          handler(text);
        }
      });
      process.stdin.on("end", () => this.fireDisconnect());
      process.stdin.on("close", () => this.fireDisconnect());
      process.stdout.on("resize", () => {
        for (const handler of this.resizeHandlers) {
          handler();
        }
      });
    }
  }

  enableInput(): void {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    this.write("\x1b[?2026l\x1b[?7h");
    this.write("\x1b[?1l\x1b>");
    this.write("\x1b[?2004l");
    this.write("\x1b[?1000l\x1b[?1003l\x1b[?1006l");
    this.write("\x1b[?25h");

    try {
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(this.wasRaw);
      }
      process.stdin.pause();
    } catch {
      // Best-effort restore
    }
  }

  drainInput(_timeoutMs: number = 1000): void {
    // Drain pending stdin events to prevent escape sequence leaks over SSH
    try {
      if (process.stdin.readableFlowing) {
        process.stdin.pause();
        setTimeout(() => process.stdin.resume(), Math.min(_timeoutMs, 200));
      }
    } catch {
      // Best-effort
    }
  }

  write(data: string): void {
    if (this.disconnected) return;
    if (this.pendingOutputBytes > MAX_BACKLOG_BYTES) {
      this.fireDisconnect();
      return;
    }
    process.stdout.write(data, () => {
      this.pendingOutputBytes = Math.max(0, this.pendingOutputBytes - Buffer.byteLength(data, "utf8"));
    });
  }

  writeSync(data: string): void {
    if (this.disconnected || !process.stdout.isTTY) return;
    try {
      fs.writeSync(1, Buffer.from(data));
    } catch {
      try {
        process.stdout.write(data);
      } catch {
        // Best-effort
      }
    }
  }

  isHeadless(): boolean {
    return !process.stdout.isTTY;
  }

  getDimensions(): { readonly columns: number; readonly rows: number } {
    return {
      columns: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    };
  }

  getPendingOutputBytes(): number {
    return this.pendingOutputBytes;
  }

  private fireDisconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    for (const handler of this.disconnectHandlers) {
      handler();
    }
  }
}

export const processTerminal = new Terminal();
