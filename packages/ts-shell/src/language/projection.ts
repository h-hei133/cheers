import path from 'node:path';
import { neutraliseForDisplay } from '../core/text/safety.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { LanguageError, languageLimits, object, position, type JsonObject } from './contract.js';
import { uriPath } from './documents.js';

export function safeText(value: unknown, limit = 4096): string {
  if (typeof value !== 'string' || value.length > limit) throw new LanguageError('protocol', 'Language server text exceeds the supported limit.');
  return neutraliseForDisplay(value);
}

export function range(value: unknown) {
  const data = object(value);
  const start = position(data.start); const end = position(data.end);
  if (end.line < start.line || end.line === start.line && end.character < start.character) throw new LanguageError('protocol', 'Language server range is reversed.');
  return { start, end };
}

export function location(value: unknown, context: ToolExecutionContext) {
  const data = object(value);
  const target = uriPath(data.uri ?? data.targetUri, context);
  return { filePath: path.relative(context.artifactRoot ?? context.workspaceRoot, target), range: range(data.range ?? data.targetSelectionRange ?? data.targetRange) };
}

export function locations(value: unknown, context: ToolExecutionContext) {
  if (value === null) return [];
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length > 1000) throw new LanguageError('protocol', 'Language server returned too many locations.');
  return entries.map(item => location(item, context));
}

export function symbols(value: unknown, context: ToolExecutionContext, depth = 0): unknown[] {
  if (!Array.isArray(value) || value.length > 500 || depth > 8) throw new LanguageError('protocol', 'Language server symbol limit exceeded.');
  return value.map(item => {
    const data = object(item);
    if (!Number.isInteger(data.kind) || (data.kind as number) < 1 || (data.kind as number) > 26) throw new LanguageError('protocol', 'Language server symbol kind is invalid.');
    return { name: safeText(data.name, 512), kind: data.kind,
      ...(data.location ? { location: location(data.location, context) } : { range: range(data.range) }),
      ...(data.children ? { children: symbols(data.children, context, depth + 1) } : {}) };
  });
}

export function hover(value: unknown): unknown {
  if (value === null) return null;
  const data = object(value);
  const entries = Array.isArray(data.contents) ? data.contents : [data.contents];
  if (entries.length > 50) throw new LanguageError('protocol', 'Language server hover limit exceeded.');
  return { contents: entries.map(item => typeof item === 'string' ? safeText(item, 16000) : safeText(object(item).value, 16000)),
    ...(data.range ? { range: range(data.range) } : {}) };
}

export function diagnostic(value: unknown, context: ToolExecutionContext): JsonObject {
  const data = object(value);
  if (data.relatedInformation !== undefined && (!Array.isArray(data.relatedInformation) || data.relatedInformation.length > 50)) throw new LanguageError('protocol', 'Language diagnostic related-information limit exceeded.');
  return { range: range(data.range), message: safeText(data.message, 2048),
    ...(typeof data.severity === 'number' ? { severity: data.severity } : {}),
    ...(typeof data.code === 'string' || typeof data.code === 'number' ? { code: safeText(String(data.code), 128) } : {}),
    ...(data.relatedInformation ? { relatedInformation: (data.relatedInformation as unknown[]).map(item => {
      const related = object(item); return { location: location(related.location, context), message: safeText(related.message, 2048) };
    }) } : {}) };
}

export function resultText(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > languageLimits.resultBytes) throw new LanguageError('unsupported', 'Language result exceeds the output limit; narrow the query.');
  return text;
}
