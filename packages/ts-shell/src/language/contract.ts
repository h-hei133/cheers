export const languageLimits = {
  frameBytes: 2 * 1024 * 1024, headerBytes: 8192, outputBytes: 32 * 1024 * 1024,
  stderrBytes: 64 * 1024, documentBytes: 256 * 1024, documents: 32, pending: 16,
  requestMs: 10000, idleMs: 60000, lifetimeMs: 5 * 60000, clients: 4, resultBytes: 256 * 1024,
} as const;

export type LanguageStatus = 'starting' | 'ready' | 'stopping' | 'stopped' | 'crashed' | 'cleanup-unverified';
export type LanguageFailure = 'unavailable' | 'unsupported' | 'invalid' | 'denied' | 'stale' | 'timeout' | 'cancelled' | 'server-error' | 'protocol' | 'crashed' | 'cleanup';

export class LanguageError extends Error {
  constructor(readonly kind: LanguageFailure, message: string) { super(message); this.name = 'LanguageError'; }
}

export interface ServerSelection { readonly command: string; readonly args: readonly string[] }
export interface Position { readonly line: number; readonly character: number }
export interface Range { readonly start: Position; readonly end: Position }
export interface DocumentSnapshot {
  readonly path: string; readonly uri: string; readonly text: string; readonly hash: string; readonly version: number;
}
export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LanguageError('protocol', 'Language server returned an invalid object.');
  return value as JsonObject;
}

export function position(value: unknown): Position {
  const item = object(value);
  if (!Number.isSafeInteger(item.line) || !Number.isSafeInteger(item.character) || (item.line as number) < 0 || (item.character as number) < 0) {
    throw new LanguageError('invalid', 'Positions must use nonnegative, zero-based UTF-16 line and character offsets.');
  }
  return { line: item.line as number, character: item.character as number };
}
