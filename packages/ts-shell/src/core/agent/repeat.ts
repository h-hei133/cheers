import { createHash } from 'node:crypto';
import { snapshotData } from '../values/data.js';

const MAX_PATTERN_LENGTH = 5;
const MAX_REPEAT_COUNT = 8;
const ARGUMENT_LIMIT = { bytes: 256 * 1024, nodes: 16_384, depth: 64, sortKeys: true } as const;

/** Observe this run's direct tool results in model order. Retain only bounded digests. */
export class ToolRepetition {
  private readonly recent: string[] = [];
  private readonly patternNotices = new Map<string, number>();

  reset(): void {
    this.recent.length = 0;
    this.patternNotices.clear();
  }

  observe(call: { readonly name: string; readonly args: unknown }): string | undefined {
    if (call.name.length > 512) {
      this.reset();
      return undefined;
    }
    let key: string;
    try {
      const args = snapshotData(call.args, ARGUMENT_LIMIT);
      key = createHash('sha256').update(JSON.stringify([call.name, args])).digest('hex');
    } catch {
      this.reset();
      return undefined;
    }

    const recent = this.recent;
    recent.push(key);
    if (recent.length > MAX_PATTERN_LENGTH * MAX_REPEAT_COUNT + 1) recent.shift();
    let count = 1;
    while (recent.at(-1 - count) === key) count += 1;
    if (count === 3 || count === 5 || count === 8) {
      return `[Tool reminder] The same call was requested ${count} times in a row. Review the latest outcome before retrying and consider a different action.`;
    }
    const pattern = repeatedPattern(recent);
    if (pattern && pattern.count > (this.patternNotices.get(pattern.key) ?? 0)) {
      this.patternNotices.set(pattern.key, pattern.count);
      if (this.patternNotices.size > MAX_PATTERN_LENGTH * 2) {
        const oldest = this.patternNotices.keys().next().value;
        if (oldest !== undefined) this.patternNotices.delete(oldest);
      }
      return `[Tool reminder] The same ${pattern.length}-call sequence was requested ${pattern.count} times. Review the latest outcomes before repeating the sequence.`;
    }
    return undefined;
  }
}

function repeatedPattern(recent: readonly string[]): { key: string; length: number; count: number } | undefined {
  for (let length = 2; length <= MAX_PATTERN_LENGTH; length++) {
    if (recent.length < length * 5) continue;
    const unit = recent.slice(-length);
    if (unit.every(value => value === unit[0])) continue;
    let matching = 0;
    while (matching < length * MAX_REPEAT_COUNT
      && recent[recent.length - matching - 1] === unit[length - (matching % length) - 1]) matching++;
    if (matching % length !== 0) continue;
    const count = matching / length;
    if (count === 3 || count === 5 || count === 8) {
      const rotations = unit.map((_, offset) => [...unit.slice(offset), ...unit.slice(0, offset)].join(':'));
      return { key: rotations.sort()[0]!, length, count };
    }
  }
  return undefined;
}
