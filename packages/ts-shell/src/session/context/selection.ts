import { createHash } from 'node:crypto';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { Session } from '../schema/sessionRecord.js';
import { messageToText } from '../../model-adapters/multimodal.js';

export type ContextSelectionMode = 'elide' | 'images' | 'thinking';
export interface ContextSelection {
  readonly version: 1;
  readonly revision: number;
  readonly entries: readonly { readonly id: string; readonly hash: string; readonly modes: readonly ContextSelectionMode[] }[];
}
type ContextSelectionSession = Pick<Session, 'turns' | 'contextSelection'>;
const MODES: readonly ContextSelectionMode[] = ['elide', 'images', 'thinking'];
export const SELECTION_LIMIT = 4096;
const effectiveSelectionCache = new WeakMap<object, {
  readonly turns: readonly SessionMessage[];
  readonly fingerprint: string;
  readonly selection: ContextSelection | undefined;
}>();

export function decodeContextSelection(value: unknown): ContextSelection {
  if (value === undefined) return { version: 1, revision: 0, entries: [] };
  const data = value as ContextSelection;
  if (!data || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.entries)
    || data.entries.length > SELECTION_LIMIT || new Set(data.entries.map(entry => entry?.id)).size !== data.entries.length
    || data.entries.some(entry => !entry || typeof entry.id !== 'string' || entry.id.length > 256 || !/^[a-f0-9]{64}$/.test(entry.hash)
      || !Array.isArray(entry.modes) || entry.modes.length > MODES.length || entry.modes.some((mode: unknown) => !MODES.includes(mode as ContextSelectionMode)))) {
    throw new Error('Saved context selection is invalid. Restore it explicitly before sending another prompt.');
  }
  return data;
}

export function selectModelContext(session: { readonly turns: readonly SessionMessage[]; readonly contextSelection?: unknown } | undefined): readonly SessionMessage[] {
  if (!session) return [];
  const selection = decodeContextSelection(session.contextSelection);
  if (!selection.entries.length) return session.turns;
  const selected = new Map(selection.entries.map(entry => [entry.id, entry]));
  return session.turns.map(message => {
    const entry = message.id && selected.get(message.id);
    return entry && entry.hash === contextMessageHash(message) ? omitContext(message, entry.modes) : message;
  });
}

export function planContextSelection(session: Session, mode: ContextSelectionMode): {
  readonly selection: ContextSelection; readonly changed: number; readonly estimatedTokens: number; readonly signed: number;
} {
  const current = decodeContextSelection(session.contextSelection);
  const entries = new Map(current.entries.map(entry => [entry.id, entry]));
  let changed = 0; let estimatedTokens = 0; let signed = 0;
  for (const message of session.turns) {
    if (!message.id) continue;
    if (message.reasoning?.signature || message.reasoning?.redacted) { signed++; continue; }
    const hash = contextMessageHash(message);
    const previous = entries.get(message.id);
    const modes = [...new Set([...(previous?.hash === hash ? previous.modes : []), mode])];
    const before = previous?.hash === hash ? omitContext(message, previous.modes) : message;
    const after = omitContext(message, modes);
    if (contextMessageHash(before) === contextMessageHash(after)) continue;
    changed++;
    estimatedTokens += Math.max(0, Math.ceil((textLength(before) - textLength(after)) / 4));
    entries.set(message.id, { id: message.id, hash, modes });
  }
  if (entries.size > SELECTION_LIMIT) throw new Error('Context selection exceeds 4096 messages; compact or restore existing selections first.');
  return { selection: { version: 1, revision: changed === 0 ? current.revision : current.revision + 1, entries: [...entries.values()] }, changed, estimatedTokens, signed };
}

export function contextMessageHash(message: SessionMessage): string {
  return createHash('sha256').update(JSON.stringify([message.role, message.content, message.reasoning, message.tool_calls, message.tool_call_id])).digest('hex');
}

/** Return only hash-valid entries that actually change the model projection. */
export function effectiveContextSelection(session: ContextSelectionSession): ContextSelection | undefined {
  const value = session.contextSelection;
  const cacheKey = typeof value === 'object' && value !== null ? value : undefined;
  const selection = decodeContextSelection(value);
  const fingerprint = `${selection.revision}:${selection.entries.map(entry =>
    `${entry.id}:${entry.hash}:${entry.modes.join('+')}`).join('|')}`;
  const cached = cacheKey ? effectiveSelectionCache.get(cacheKey) : undefined;
  if (cached?.turns === session.turns && cached.fingerprint === fingerprint) return cached.selection;
  const messages = new Map(session.turns.flatMap(message => message.id ? [[message.id, message] as const] : []));
  const entries = selection.entries.filter(entry => {
    const message = messages.get(entry.id);
    if (!message || entry.hash !== contextMessageHash(message)) return false;
    return contextMessageHash(omitContext(message, entry.modes)) !== entry.hash;
  });
  const effective = entries.length ? { ...selection, entries } : undefined;
  if (cacheKey) effectiveSelectionCache.set(cacheKey, { turns: session.turns, fingerprint, selection: effective });
  return effective;
}

/** A revision or stale entry is not a prompt identity; only effective entries are. */
export function contextSelectionIdentity(session: ContextSelectionSession): unknown {
  const effective = effectiveContextSelection(session);
  return effective ? { version: 1, entries: effective.entries } : undefined;
}

function omitContext(message: SessionMessage, modes: readonly ContextSelectionMode[]): SessionMessage {
  if (message.reasoning?.signature || message.reasoning?.redacted) return message;
  let content = message.content;
  if (modes.includes('images') && Array.isArray(content)) content = content.map(block => block.type === 'image_url'
    ? { type: 'text' as const, text: `[Image omitted from context; original retained at ${message.id}.]` } : block);
  if (modes.includes('elide')) {
    const text = messageToText(content);
    if (message.role === 'tool' && text.length > 2048) content = `[Tool result omitted from context; original retained at ${message.id}.]`;
    else if (typeof content === 'string' && message.role !== 'system') content = content.replace(/```[^\n]*\n[\s\S]*?\n```/g,
      block => block.length > 2048 ? `[Large block omitted from context; original retained at ${message.id}.]` : block);
  }
  const { reasoning, ...rest } = message;
  return { ...rest, content, ...(reasoning && !modes.includes('thinking') ? { reasoning } : {}) };
}

function textLength(message: SessionMessage): number {
  return messageToText(message.content).length + (message.reasoning?.text.length ?? 0);
}
