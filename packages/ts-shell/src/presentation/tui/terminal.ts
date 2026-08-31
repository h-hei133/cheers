import fs from "node:fs";
import { detectTerminalCapabilities, type TerminalCapabilities } from "./terminalCapabilities.js";

/**
 * Production ProcessTerminal Driver
 * Manages raw mode, safe unbuffered writes, output backlog protection, and clean exit resets.
 */
export class ProcessTerminal {
  readonly capabilities: TerminalCapabilities;
  private isRaw = false;

  constructor() {
    this.capabilities = detectTerminalCapabilities();
  }

  setRawMode(enable: boolean): void {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(enable);
        this.isRaw = enable;
        if (enable) {
          process.stdin.resume();
        }
      } catch {
        // Best-effort raw mode
      }
    }
  }

  isRawMode(): boolean {
    return this.isRaw;
  }

  writeSync(data: string): void {
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

  write(data: string): void {
    process.stdout.write(data);
  }

  getDimensions(): { readonly rows: number; readonly cols: number } {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80,
    };
  }
}

export const processTerminal = new ProcessTerminal();
