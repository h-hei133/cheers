import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import { snapshotData } from '../../core/values/data.js';
import type { SessionMessage } from '../schema/sessionMessage.js';

export type ContextEdit = { readonly kind: 'replace'; readonly text: string }
  | { readonly kind: 'omit' } | { readonly kind: 'restore' };

export type AnnotationChange = { readonly type: 'context-edit'; readonly edit: ContextEdit }
  | { readonly type: 'label'; readonly label: string | null };

export type SessionAnnotation = AnnotationChange & {
  readonly id: string;
  readonly parentId: string;
  readonly targetId: string;
  readonly targetDigest: string;
  readonly timestamp: string;
};

export interface ModelContextEdit {
  readonly id: string;
  readonly hash: string;
  readonly edit: Exclude<ContextEdit, { kind: 'restore' }>;
}

export interface SessionLabel {
  readonly id: string;
  readonly text: string;
}

const TEXT_LIMIT = 64 * 1024;
export const ANNOTATION_CAPTURE_BYTES = 2 * TEXT_LIMIT + 4096;

export function isAnnotationKind(value: unknown): value is SessionAnnotation['type'] {
  return value === 'context-edit' || value === 'label';
}

export function isSessionAnnotation(value: unknown): value is SessionAnnotation {
  if (!isRecord(value) || !isAnnotationKind(value.type)
    || Object.keys(value).length !== 7 || !isAnnotationEntryId(value.id) || !isAnnotationEntryId(value.parentId)
    || !isAnnotationEntryId(value.targetId) || value.id === value.parentId || value.id === value.targetId
    || typeof value.targetDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.targetDigest)
    || typeof value.timestamp !== 'string' || value.timestamp.length > 64 || !Number.isFinite(Date.parse(value.timestamp))) return false;
  return validChange(value);
}

export function isAnnotationChange(value: unknown): value is AnnotationChange {
  return isRecord(value) && Object.keys(value).length === 2 && isAnnotationKind(value.type) && validChange(value);
}

export function captureAnnotationChange(value: unknown): AnnotationChange | undefined {
  try {
    const change = snapshotData(value, { bytes: ANNOTATION_CAPTURE_BYTES, nodes: 16, depth: 3 });
    return isAnnotationChange(change) ? change : undefined;
  } catch { return undefined; }
}

function validChange(value: Record<string, unknown>): boolean {
  if (value.type === 'label') return value.label === null || typeof value.label === 'string'
    && value.label === value.label.trim() && value.label.length > 0 && Buffer.byteLength(value.label) <= 256
    && !/[\x00-\x1f\x7f-\x9f]/u.test(value.label);
  const edit = value.edit;
  if (!isRecord(edit)) return false;
  if (edit.kind === 'omit' || edit.kind === 'restore') return Object.keys(edit).length === 1;
  return edit.kind === 'replace' && Object.keys(edit).length === 2 && typeof edit.text === 'string' && !!edit.text.trim()
    && Buffer.byteLength(edit.text) <= TEXT_LIMIT && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(edit.text);
}

export function isAnnotationEntryId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/u.test(value);
}

/** Bind the operation to the complete stored record, including replay identity. */
export function annotationTargetDigest(entry: SessionMessage & { readonly type: 'message' }): string {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

export function isEditableMessage(message: SessionMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'custom') return false;
  if (message.metadata && Object.keys(message.metadata).length > 0) return false;
  if (message.reasoning || message.requestDeclaration || message.tool_calls !== undefined || message.tool_call_id !== undefined) return false;
  return typeof message.content === 'string' || message.content.every(block => block.type === 'text');
}
