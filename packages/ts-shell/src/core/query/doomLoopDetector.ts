
export interface ToolCallHistoryEntry {
  readonly toolName: string;
  readonly argsHash: string;
  readonly timestamp: number;
}

export class DoomLoopDetector {
  private readonly threshold: number;
  private readonly maxHistorySize: number;
  private readonly callHistory: ToolCallHistoryEntry[] = [];

  constructor(threshold: number = 3, maxHistorySize: number = 50) {
    this.threshold = threshold;
    this.maxHistorySize = maxHistorySize;
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
    if (this.callHistory.length > this.maxHistorySize) {
      this.callHistory.splice(0, this.callHistory.length - this.maxHistorySize);
    }

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

  private hashArgs(value: unknown): string {
    try {
      return JSON.stringify(this.canonicalize(value));
    } catch {
      return String(value);
    }
  }

  private canonicalize(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of keys) {
      sorted[key] = this.canonicalize(obj[key]);
    }
    return sorted;
  }
}
