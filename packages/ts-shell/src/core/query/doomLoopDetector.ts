
export interface ToolCallHistoryEntry {
  readonly toolName: string;
  readonly argsHash: string;
  readonly timestamp: number;
}

export class DoomLoopDetector {
  private readonly threshold: number;
  private readonly cycleThreshold: number;
  private readonly maxCycleLength: number;
  private readonly maxHistorySize: number;
  private readonly callHistory: ToolCallHistoryEntry[] = [];

  constructor(
    threshold: number = 3,
    maxHistorySize: number = 50,
    cycleThreshold: number = 5,
    maxCycleLength: number = 5,
  ) {
    this.threshold = threshold;
    this.cycleThreshold = cycleThreshold;
    this.maxCycleLength = maxCycleLength;
    this.maxHistorySize = maxHistorySize;
  }

  recordAndCheck(toolName: string, args: Record<string, unknown>): {
    readonly isDoomLoop: boolean;
    readonly repeatCount: number;
    /** How many calls the repeating unit spans; 1 for a repeated single call. */
    readonly cycleLength: number;
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

    const repeatCount = this.countConsecutive(toolName, argsHash);
    // A call that repeats immediately is the case the tighter threshold is for:
    // it is the clearest sign of being stuck, and there is no pattern to mistake
    // for ordinary work.
    if (repeatCount >= this.threshold) {
      return { isDoomLoop: true, repeatCount, cycleLength: 1 };
    }

    // Longer cycles are checked separately rather than by relaxing the
    // threshold above. `read → edit → read → edit → read → edit` is ordinary
    // work and matches a cycle of two after three rounds; only a pattern that
    // keeps going past a handful of rounds is a loop. Judging both by one
    // threshold would either miss alternation or flag normal editing.
    const cycle = this.findRepeatingCycle();
    if (cycle) {
      return { isDoomLoop: true, repeatCount: cycle.rounds, cycleLength: cycle.length };
    }

    return { isDoomLoop: false, repeatCount, cycleLength: 1 };
  }

  reset(): void {
    this.callHistory.length = 0;
  }

  /** How many times the most recent call repeats immediately before it. */
  private countConsecutive(toolName: string, argsHash: string): number {
    let repeatCount = 0;
    for (let i = this.callHistory.length - 1; i >= 0; i--) {
      const past = this.callHistory[i]!;
      if (past.toolName === toolName && past.argsHash === argsHash) {
        repeatCount++;
      } else {
        break;
      }
    }
    return repeatCount;
  }

  /**
   * The shortest repeating unit at the tail that has run enough rounds to count.
   *
   * Lengths are tried from one upwards so the tightest explanation wins: if a
   * history repeats every call, that is the cycle, not a longer pattern that
   * happens to contain it.
   */
  private findRepeatingCycle(): { readonly length: number; readonly rounds: number } | undefined {
    const history = this.callHistory;
    for (let length = 2; length <= this.maxCycleLength; length += 1) {
      const rounds = this.cycleThreshold;
      const required = length * rounds;
      if (history.length < required) continue;

      let matches = true;
      for (let offset = 0; offset < required; offset += 1) {
        const actual = history[history.length - required + offset]!;
        const expected = history[history.length - length + (offset % length)]!;
        if (actual.toolName !== expected.toolName || actual.argsHash !== expected.argsHash) {
          matches = false;
          break;
        }
      }
      if (matches) return { length, rounds };
    }
    return undefined;
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
