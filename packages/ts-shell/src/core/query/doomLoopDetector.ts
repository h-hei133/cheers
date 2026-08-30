
export interface ToolCallHistoryEntry {
  readonly toolName: string;
  readonly argsHash: string;
  readonly timestamp: number;
}

export class DoomLoopDetector {
  private readonly threshold: number;
  private readonly callHistory: ToolCallHistoryEntry[] = [];

  constructor(threshold: number = 3) {
    this.threshold = threshold;
  }

  recordAndCheck(toolName: string, args: Record<string, unknown>): {
    readonly isDoomLoop: boolean;
    readonly repeatCount: number;
  } {
    const argsHash = this.hashArgs(args);
    const entry: ToolCallHistoryEntry = {
      toolName,
      argsHash,
      timestamp: Date.now(),
    };

    this.callHistory.push(entry);

    // Count consecutive identical tool calls from the tail
    let repeatCount = 0;
    for (let i = this.callHistory.length - 1; i >= 0; i--) {
      const past = this.callHistory[i];
      if (past.toolName === toolName && past.argsHash === argsHash) {
        repeatCount++;
      } else {
        break;
      }
    }

    return {
      isDoomLoop: repeatCount >= this.threshold,
      repeatCount,
    };
  }

  reset(): void {
    this.callHistory.length = 0;
  }

  private hashArgs(args: Record<string, unknown>): string {
    try {
      const keys = Object.keys(args).sort();
      const normalized: Record<string, unknown> = {};
      for (const k of keys) {
        normalized[k] = args[k];
      }
      return JSON.stringify(normalized);
    } catch {
      return String(args);
    }
  }
}
