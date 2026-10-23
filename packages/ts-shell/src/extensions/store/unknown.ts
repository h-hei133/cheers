import fs from 'node:fs';
import { isRecord } from '../../core/values/record.js';
import { readTextFile } from '../../core/workspace/files.js';
import { writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import type { EffectOutcome } from '../model.js';

const JOURNAL_CHARACTERS = 128 * 1024;
const JOURNAL_OUTCOMES = 32;
const EFFECTS = new Set<EffectOutcome['effect']>(['published', 'removed', 'saved', 'executed']);
const UNREADABLE: EffectOutcome = {
  effect: 'executed',
  durability: 'unknown',
  detail: 'Extension durability journal is unreadable; inspect retained package data before a fresh mutation.',
};

export function unknownFile(file: string): string {
  return `${file}.unknown.json`;
}

export function readUnknownOutcomes(file: string): EffectOutcome[] {
  try {
    const raw = readTextFile(file, JOURNAL_CHARACTERS * 4);
    if (raw === undefined) return [];
    if (raw.length > JOURNAL_CHARACTERS) return [{ ...UNREADABLE }];
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.outcomes)
      || value.outcomes.length > JOURNAL_OUTCOMES) return [{ ...UNREADABLE }];
    return value.outcomes.map(entry => {
      if (!isRecord(entry) || !EFFECTS.has(entry.effect as EffectOutcome['effect'])
        || entry.durability !== 'unknown' || typeof entry.detail !== 'string'
        || entry.detail.length === 0 || entry.detail.length > 4096) throw new Error();
      return { effect: entry.effect as EffectOutcome['effect'], durability: 'unknown' as const, detail: entry.detail };
    });
  } catch {
    return [{ ...UNREADABLE }];
  }
}

export function writeUnknownOutcomes(file: string, outcomes: readonly EffectOutcome[]): void {
  writeJsonFileAtomic(file, { schema: 1, outcomes });
}

export function clearUnknownOutcomes(file: string): void {
  fs.rmSync(file, { force: true });
}
