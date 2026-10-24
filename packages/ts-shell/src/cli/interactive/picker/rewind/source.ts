import { messageToText } from '../../../../model-adapters/multimodal.js';
import { isSessionContextMessage, type SessionMessage } from '../../../../session/schema/sessionMessage.js';

/** Source admission bounds references and text units, not the runtime's heap. */
export const REWIND_LIMITS = Object.freeze({ turns: 50_000, questions: 20_000, parts: 50_000, textUnits: 32 * 1024 * 1024 });
const CONTROL_CHECK_INTERVAL = 256;
const YIELD_INTERVAL = 1024;

export interface RewindPoint {
  readonly entryId: string;
  readonly prompt: string;
  readonly dropped: number;
  readonly version?: string;
}

/** Capture newest-first questions without allocating a second messages array. */
export function rewindPoints(turns: readonly SessionMessage[], signal?: AbortSignal): RewindPoint[] {
  signal?.throwIfAborted();
  if (turns.length > REWIND_LIMITS.turns) throw new Error('Conversation exceeds back browsing limits.');
  const points: RewindPoint[] = [];
  const identities = new Set<string>();
  let dropped = 0;
  let units = 0;
  let parts = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    signal?.throwIfAborted();
    const turn = turns[index]!;
    if (isSessionContextMessage(turn)) continue;
    if (turn.role === 'user' && turn.id !== undefined) {
      units += turn.id.length;
      if (typeof turn.content === 'string') units += turn.content.length;
      else if (turn.content) {
        parts += turn.content.length;
        if (parts > REWIND_LIMITS.parts) throw new Error('Conversation exceeds back browsing limits.');
        let texts = 0;
        for (const block of turn.content) if (block.type === 'text') { units += block.text.length; texts++; }
        units += Math.max(0, texts - 1);
      }
      if (units > REWIND_LIMITS.textUnits) throw new Error('Conversation exceeds back browsing limits.');
      const prompt = messageToText(turn.content);
      if (prompt.trim()) {
        if (identities.has(turn.id)) throw new Error('Conversation question identity is ambiguous.');
        identities.add(turn.id);
        if (points.length >= REWIND_LIMITS.questions) throw new Error('Conversation exceeds back browsing limits.');
        points.push({ entryId: turn.id, prompt, dropped });
      }
    }
    dropped++;
  }
  return points;
}

async function rewindPointsAsync(turns: readonly SessionMessage[], signal?: AbortSignal): Promise<RewindPoint[]> {
  await yieldForAbort(signal);
  if (turns.length > REWIND_LIMITS.turns) throw new Error('Conversation exceeds back browsing limits.');
  const points: RewindPoint[] = [];
  const identities = new Set<string>();
  let dropped = 0;
  let units = 0;
  let parts = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    if ((index & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
    const turn = turns[index]!;
    if (isSessionContextMessage(turn)) continue;
    if (turn.role === 'user' && turn.id !== undefined) {
      units += turn.id.length;
      if (typeof turn.content === 'string') units += turn.content.length;
      else if (turn.content) {
        parts += turn.content.length;
        if (parts > REWIND_LIMITS.parts) throw new Error('Conversation exceeds back browsing limits.');
        let texts = 0;
        for (const block of turn.content) if (block.type === 'text') { units += block.text.length; texts++; }
        units += Math.max(0, texts - 1);
      }
      if (units > REWIND_LIMITS.textUnits) throw new Error('Conversation exceeds back browsing limits.');
      const prompt = messageToText(turn.content);
      if (prompt.trim()) {
        if (identities.has(turn.id)) throw new Error('Conversation question identity is ambiguous.');
        identities.add(turn.id);
        if (points.length >= REWIND_LIMITS.questions) throw new Error('Conversation exceeds back browsing limits.');
        points.push({ entryId: turn.id, prompt, dropped });
      }
    }
    dropped++;
  }
  return points;
}

/** One captured source and one current-query cache shared by continuation pages. */
export class RewindSource {
  private readonly points: readonly RewindPoint[];
  private readonly search: readonly string[];
  private query = '';
  private matches: readonly RewindPoint[];
  readonly moreId: string;

  constructor(
    turns: readonly SessionMessage[],
    signal?: AbortSignal,
    version?: string,
    prepared?: { readonly points: readonly RewindPoint[]; readonly search: readonly string[] },
  ) {
    const points = prepared ? [...prepared.points] : rewindPoints(turns, signal);
    if (version !== undefined) for (let index = 0; index < points.length; index++) points[index] = { ...points[index]!, version };
    this.points = points;
    this.search = prepared?.search ?? points.map(point => `${point.entryId} ${point.prompt}`.toLowerCase());
    this.matches = this.points;
    const ids = new Set(this.points.map(point => point.entryId));
    let moreId = '__more__';
    while (ids.has(moreId)) moreId += '_';
    this.moreId = moreId;
  }

  static async create(turns: readonly SessionMessage[], signal?: AbortSignal, version?: string): Promise<RewindSource> {
    const points = await rewindPointsAsync(turns, signal);
    if (version !== undefined) for (let index = 0; index < points.length; index++) points[index] = { ...points[index]!, version };
    const search: string[] = [];
    for (let index = 0; index < points.length; index++) {
      signal?.throwIfAborted();
      if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
      search.push(`${points[index]!.entryId} ${points[index]!.prompt}`.toLowerCase());
    }
    await yieldForAbort(signal);
    return new RewindSource([], undefined, undefined, { points, search });
  }

  selection(selector?: string): { readonly point: RewindPoint; readonly index: number } | undefined {
    if (!selector) return undefined;
    let index = this.points.findIndex(point => point.entryId === selector);
    if (index < 0 && /^[1-9]\d*$/.test(selector)) index = Number(selector) - 1;
    const point = this.points[index];
    return point ? { point, index } : undefined;
  }

  indexOf(query: string, entryId: string): number | undefined {
    const index = this.matchesFor(query).findIndex(point => point.entryId === entryId);
    return index < 0 ? undefined : index;
  }

  page(query: string, offset: number, size: number): { readonly entries: readonly RewindPoint[]; readonly total: number } {
    const matches = this.matchesFor(query);
    return { entries: matches.slice(offset, offset + size), total: matches.length };
  }

  private matchesFor(query: string): readonly RewindPoint[] {
    if (query !== this.query) {
      this.query = query;
      this.matches = query ? this.points.filter((_point, index) => this.search[index]!.includes(query)) : this.points;
    }
    return this.matches;
  }
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}
